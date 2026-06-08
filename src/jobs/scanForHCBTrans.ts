import { users } from "@/schema/users";
import { and, eq, isNull, not } from "drizzle-orm";
import type { RequestHandler } from "@/index.ts";
import HCBInstance from "@/lib/hcbscan/index";
import HCB from "@/lib/hcb/index";
import { hcb } from "@/schema/hcb";
let queue: string[] = [];
let initialized = false;
type UserRow = typeof users._.inferSelect;

const formatKey = (key: string) =>
  key
    .split(/[._]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const formatDate = (iso: string) => {
  const d = new Date(iso);

  const pad = (n: number) => String(n).padStart(2, "0");

  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${String(
    d.getUTCFullYear(),
  ).slice(-2)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(
    d.getUTCSeconds(),
  )}`;
};

export default {
  name: "scanForHCBTrans",
  execute: async ({ client, pg, logger }: RequestHandler) => {
    try {
      const userRows = await pg
        .select({
          userId: users.userId,
          channel: users.channel,
          meta: users.meta,
        })
        .from(users)
        .where(
          and(
            eq(users.disabled, false),
            not(isNull(users.meta)),
            not(isNull(users.channel)),
          ),
        );

      const hcbRows = await pg.select().from(hcb);

      const allowedUsers = userRows.filter((user) =>
        (user.meta ?? []).some((m) => m.startsWith("HCBId::")),
      );
      if (allowedUsers.length === 0) return;
      const HCBScan = new HCBInstance(logger);
      const HCBAPI = new HCB(logger);

      if (!initialized) {
        queue = allowedUsers
          .filter((u): u is typeof u & { userId: string } => !!u.userId)
          .slice()
          .sort((a, b) => {
            const aRan =
              a.meta
                ?.find((m) => m.startsWith("HCBRan::"))
                ?.split("HCBRan::")[1] ?? "0";

            const bRan =
              b.meta
                ?.find((m) => m.startsWith("HCBRan::"))
                ?.split("HCBRan::")[1] ?? "0";

            return Number(aRan) - Number(bRan);
          })
          .map((u) => u.userId);

        initialized = true;
      }

      const batchUserIds = queue.slice(0, 40);
      const userMap = new Map(allowedUsers.map((u) => [u.userId, u]));

      for (const userId of batchUserIds) {
        const user = userMap.get(userId);
        if (!user || !user.userId || !user.meta || user.meta.length === 0) continue;
        const updateFields: Partial<UserRow> = {};
        const HCBId = user.meta
          .find((m) => m.startsWith("HCBId::"))
          ?.split("HCBId::")[1];

        if (!HCBId) continue;
        const HCBData = await HCBScan.userActivities({
          id: HCBId,
        });

        if (!HCBData.ok || !HCBData.data.ok || HCBData.data.data?.length === 0)
          continue;

        const activities = HCBData.data.data ?? [];
        const newIds = activities.map((a) => a.id ?? "").filter(Boolean);
        const existing = hcbRows.find((r) => r.user_id === HCBId);

        if (!existing) {
          await pg.insert(hcb).values({
            user_id: HCBId,
            ids: newIds,
          });

          const filteredMeta = (user.meta ?? []).filter(entry => !entry.startsWith("HCBRan::"));
          updateFields.meta = [...filteredMeta, "HCBRan::" + Date.now()];
          
          await pg.update(users).set(updateFields).where(eq(users.userId, user.userId));

          continue;
        }

        const existingIds = existing.ids ?? [];
        const mergedIds = Array.from(new Set([...existingIds, ...newIds]));
        if (!existingIds || existingIds.length === 0) {
          await pg
            .update(hcb)
            .set({ ids: mergedIds })
            .where(eq(hcb.user_id, HCBId));

          const filteredMeta = (updateFields.meta ?? []).filter(entry => !entry.startsWith("HCBRan::"));
          updateFields.meta = [...filteredMeta, "HCBRan::" + Date.now()];
          await pg.update(users).set(updateFields).where(eq(users.userId, user.userId));
          continue;
        }

        if (mergedIds.length !== existingIds.length) {
          const addedActivities = activities
            .filter((a) => !existingIds.includes(a.id ?? ""))
            .slice(0, 5);

          if (addedActivities.length === 0) continue;

          const enrichedActivities = await Promise.all(
            addedActivities.map(async (a) => {
              if (!a.id) return;
              const activityData = await HCBAPI.activities({
                activity_id: a.id,
              });

              if (!activityData.ok) return null;

              const data = activityData?.data.transaction;
              if (!data) return null;

              const amountUSD =
                typeof data.amount_cents === "number"
                  ? (data.amount_cents / 100).toFixed(2)
                  : "0.00";

              const typeFormatted = data.type
                ? data.type
                    .split("_")
                    .map((s: string) => s.charAt(0).toUpperCase() + s.slice(1))
                    .join(" ")
                : "Unknown Type";

              const fields = [
                { label: "Transaction", value: formatKey(a.key!) },
                { label: "ID", value: a.id },
                { label: "Org", value: a.organization?.name ?? "Unknown Org" },
                { label: "Type", value: typeFormatted },
                { label: "Amount", value: `$${amountUSD}` },
                { label: "Memo", value: data.memo ?? "No memo" },
                { label: "Created At", value: formatDate(a.created_at!) },
              ];

              return fields.map((f) => `*${f.label}*: ${f.value}`).join("\n");
            }),
          );

          await pg
            .update(hcb)
            .set({ ids: mergedIds })
            .where(eq(hcb.user_id, HCBId));

          const filteredMeta = (updateFields.meta ?? []).filter(entry => !entry.startsWith("HCBRan::"));
          updateFields.meta = [...filteredMeta, "HCBRan::" + Date.now()];
          await pg.update(users).set(updateFields).where(eq(users.userId, user.userId));
          
          await client.chat.postMessage({
            channel: user.channel ? user.channel : user.userId,
            text: enrichedActivities.join("\n"),
          });
          continue;
        }
      }

      queue = [...queue.slice(40), ...batchUserIds];
    } catch (e) {}
  },
};
