import { users } from "../schema/users";
import { and, eq, isNull, not } from "drizzle-orm";
import type { RequestHandler } from "..";
import HCBInstance from "../lib/hcbscan";
import HCB from "../lib/hcb";
import { hcb } from "../schema/hcb";

const formatKey = (key: string) =>
  key
    .split(".")
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

      for (const user of allowedUsers) {
        if (!user.userId || !user.meta || user.meta.length === 0) continue;
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
        const newIds = activities.map((a: any) => a.id).filter(Boolean);
        const existing = hcbRows.find((r) => r.user_id === HCBId);

        if (!existing) {
          await pg.insert(hcb).values({
            user_id: HCBId,
            ids: newIds,
          });

          continue;
        }

        const existingIds = existing.ids ?? [];
        const mergedIds = Array.from(new Set([...existingIds, ...newIds]));
        if (!existingIds || existingIds.length === 0) {
          await pg
            .update(hcb)
            .set({ ids: mergedIds })
            .where(eq(hcb.user_id, HCBId));
        }

        if (mergedIds.length !== existingIds.length) {
          const addedActivities = activities.filter(
            (a: any) => !existingIds.includes(a.id),
          );

          if (addedActivities.length === 0) continue;

          const enrichedActivities = await Promise.all(
            addedActivities.map(async (a: any) => {
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
        
              return fields
                .map((f) => `*${f.label}*: ${f.value}`)
                .join("\n");
            }),
          );

          const text = enrichedActivities.join("\n\n");

          await pg
            .update(hcb)
            .set({ ids: mergedIds })
            .where(eq(hcb.user_id, HCBId));

          await client.chat.postMessage({
            channel: user.channel ? user.channel : user.userId,
            text,
          });
        }
      }
    } catch (e) {}
  },
};
