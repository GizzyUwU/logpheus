import type { logger as LogtapeLogger, DatabaseType } from "@/index.ts";
import { projects } from "@/schema/projects";
import { and, eq, isNull, or } from "drizzle-orm";
import { yswsUsers } from "./schema/ysws";

export default async function (db: DatabaseType, logger: typeof LogtapeLogger) {
  const existingProjects = await db
    .select()
    .from(projects)
    .where(or(isNull(projects.userId), eq(projects.userId, "")));
  if (existingProjects.length === 0) return;
  const yswsRows = await db.select().from(yswsUsers);

  logger.info("Migrating users to new table schema!");

  const allProjectIds = [
    ...new Set(yswsRows.flatMap((user) => user.projects ?? [])),
  ];

  if (allProjectIds.length === 0) return;

  const projectMap = new Map(
    existingProjects.map((project) => [project.id, project]),
  );

  let updatedProjects = 0;

  for (const user of yswsRows) {
    for (const projectId of user.projects ?? []) {
      const project = projectMap.get(projectId);

      if (!project) continue;
      if (project.userId !== user.userId) {
        await db
          .update(projects)
          .set({
            userId: user.userId,
          })
          .where(eq(projects.id, projectId));

        updatedProjects++;

        logger.info(`Assigned project ${projectId} to user ${user.userId}`);
      }
    }
    
    await db
      .update(yswsUsers)
      .set({ projects: null })
      .where(
        and(
          eq(yswsUsers.userId, user.userId),
          eq(yswsUsers.yswsId, user.yswsId),
        ),
      );
  }

  logger.info(`Assigned ${updatedProjects} projects to users.`);
}
