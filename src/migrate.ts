import type { logger as LogtapeLogger, DatabaseType } from "@/index.ts";
import { users } from "@/schema/users.ts";
import { yswsUsers } from "@/schema/ysws.ts";
import { projects } from "@/schema/projects";
import { eq, inArray } from "drizzle-orm";
import ysws from "@/ysws.ts";

async function genAPIKey(pg: DatabaseType): Promise<string> {
  while (true) {
    const key = "logpheus_sk_" + crypto.randomUUID().replace(/-/g, "");
    const exists = await pg
      .select()
      .from(users)
      .where(eq(users.apiKey, key))
      .limit(1);
    if (exists.length === 0) return key;
  }
}

export default async function (db: DatabaseType, logger: typeof LogtapeLogger) {
  const usersToUpdate = await db
    .select()
    .from(users)
    .then(rows => rows.filter(u => (u.projects?.length ?? 0) > 0));

  if (usersToUpdate.length === 0) return;

  logger.info("Migrating users to new table schema!");

  const allProjectIds = [
    ...new Set(usersToUpdate.flatMap((user) => user.projects ?? [])),
  ];

  let projectMap = new Map<number, typeof projects.$inferSelect>();

  if (allProjectIds.length > 0) {
    const existingProjects = await db
      .select()
      .from(projects)
      .where(inArray(projects.id, allProjectIds));

    projectMap = new Map(
      existingProjects.map((project) => [project.id, project]),
    );

    let updatedProjects = 0;

    for (const user of usersToUpdate) {
      const userProjects = user.projects ?? [];

      for (const projectId of userProjects) {
        const project = projectMap.get(projectId);

        if (!project) continue;

        if (project.ysws !== ysws.flavortown.id) {
          await db
            .update(projects)
            .set({
              ysws: ysws.flavortown.id,
              ...(project.predictedCookies != null
                ? {
                    predictedCurrency: project.predictedCookies,
                    predictedCookies: 0,
                  }
                : {}),
            })
            .where(eq(projects.id, projectId));

          updatedProjects++;

          logger.info(
            `Updated project ${projectId} ysws from ${project.ysws} -> ${ysws.flavortown.id}`,
          );
        }
      }
    }

    logger.info(`Updated ${updatedProjects} project ysws mappings.`);
  }

  const rows = usersToUpdate.map((user) => {
    const goals =
      (user.meta ?? [])
        .find((item) => item.startsWith("Goals::["))
        ?.replace("Goals::[", "")
        .replace("]", "")
        .split(",")
        .map((id) => parseInt(id.trim()))
        .filter((id) => !isNaN(id)) ?? [];

    const userProjectMultipliers = (user.projects ?? [])
      .map((id) => projectMap.get(id)?.multiplier)
      .filter((m): m is number => m != null);

    const avgMult =
      userProjectMultipliers.length > 0
        ? userProjectMultipliers.reduce((sum, m) => sum + m, 0) /
          userProjectMultipliers.length
        : null;

    return {
      yswsId: ysws.flavortown.id,
      apiKey: user.apiKey,
      userId: user.userId,
      projects: user.projects,
      disabled: user.disabled,
      optOuts: user.optOuts,
      region: user.region,
      goal: goals,
      avgMult,
    };
  });

  await db.insert(yswsUsers).values(rows).onConflictDoNothing();

  logger.info(
    `Inserted ${rows.length} rows into ysws table, updating users...`,
  );

  for (const user of usersToUpdate) {
    const region =
      user?.meta?.find((s) => s.startsWith("Region::"))?.split("::")[1] ?? "";
    await db
      .update(users)
      .set({
        ysws: [...new Set([...(user.ysws ?? []), ysws.flavortown.id])],
        projects: [],
        region,
        apiKey: await genAPIKey(db),
        ...(user.meta
          ? {
              meta: user.meta.filter((item) => !item.startsWith("Goals::")),
            }
          : {}),
      })
      .where(eq(users.apiKey, user.apiKey!));
  }

  logger.info(
    `${usersToUpdate.length} users migrated! Added to flavortown ysws table with projects and their apiKey dropping projects and apiKey from users table`,
  );
}
