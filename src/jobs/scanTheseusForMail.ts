import { users } from "@/schema/users";
import { and, eq, isNull, not } from "drizzle-orm";
import type { RequestHandler } from "@/index.ts";
import { theseus } from "@/schema/theseus";
import Theseus from "@/lib/theseus";
import { getGenericErrorMessage } from "@/lib/genericError";

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
  name: "scanTheseusForMail",
  execute: async ({ client, pg, logger, prefix }: RequestHandler) => {
    try {
      const userRows = await pg
        .select({
          userId: users.userId,
          channel: users.channel,
          meta: users.meta,
          theseusKey: users.theseusKey,
        })
        .from(users)
        .where(and(eq(users.disabled, false), not(isNull(users.theseusKey))));

      for (const user of userRows) {
        if (!user || !user.userId || !user.theseusKey) continue;
        const mailRows = await pg
          .select()
          .from(theseus)
          .where(eq(theseus.userId, user.userId));
        const theseusClient = new Theseus(user.theseusKey, logger);
        const newMail = await theseusClient.mail();
        if (!newMail || !newMail.status) {
          const ctx = logger.with({
            status: newMail.status,
            ok: newMail.ok,
          });
          ctx.error("scanTheseusForMail failed because theseus api fail");
          continue;
        }

        if (!newMail.ok || !newMail.data) {
          if (newMail.status === 200 || newMail.status === 408) continue;
          const msg = getGenericErrorMessage(newMail.status, prefix!);
          if (msg === "Server is down!" || msg === "Server timed out!") return;
          const ctx = logger.with({
            msg,
            status: newMail.status,
            ok: newMail.ok,
          });
          ctx.error("scanTheseusForMail failed because theseus api fail");
          continue;
        }

        const pkgTypeExists = newMail.data.mail.find(
          (mail) => mail.type === "warehouse_order" || mail.type === "package",
        );

        let packageDetails: Map<
          string,
          { tracking_number?: string | null; tracking_link?: string | null }
        > = new Map();

        if (pkgTypeExists) {
          const packages = await theseusClient.packages();
          if (packages.ok && packages.data.packages.length > 0) {
            for (const pkg of packages.data.packages) {
              packageDetails.set(pkg.id, {
                tracking_number: pkg.tracking_number ?? null,
                tracking_link: pkg.tracking_link ?? null,
              });
            }
          }
        }

        const existingIds = new Set(mailRows.map((r) => r.id));
        const apiMailViaId = new Map(newMail.data.mail.map((m) => [m.id, m]));
        const newIds = newMail.data.mail.filter((m) => !existingIds.has(m.id));

        if (newIds.length > 0) {
          await pg.insert(theseus).values(
            newIds.map((mail) => {
              const pkg = packageDetails.get(mail.id);
              return {
                userId: user.userId,
                id: mail.id,
                title: mail.title ?? "undefined",
                type: mail.type,
                public_url: mail.public_url,
                status: mail.status,
                created_at: new Date(mail.created_at),
                updated_at: new Date(mail.updated_at),
                dispatched_at: mail.dispatched_at
                  ? new Date(mail.dispatched_at)
                  : null,
                mailed_at: mail.mailed_at ? new Date(mail.mailed_at) : null,
                carrier: mail.carrier ?? null,
                service: mail.service ?? null,
                tracking_number: pkg?.tracking_number ?? null,
                tracking_link: pkg?.tracking_link ?? null,
              };
            }),
          );
          if (mailRows.length === 0) {
            for (const item of newIds) {
              const pkg = packageDetails.get(item.id);
              const text = [
                {
                  label: `New ${item.type} on HC Mail`,
                  value: "",
                },
                { label: "Item Name", value: item.title ?? "undefined" },
                {
                  label: "Created At",
                  value: formatDate(item.created_at),
                },
                ...(item.tags.length > 0
                  ? [
                      {
                        label: "Tags",
                        value: item.tags.join(", "),
                      },
                    ]
                  : []),
                ...(pkg?.tracking_number &&
                pkg?.tracking_number !== null &&
                pkg.tracking_number.length > 0 &&
                !user.channel
                  ? [
                      {
                        label: "Tracking Number",
                        value: pkg.tracking_number,
                      },
                    ]
                  : []),
                ...(pkg?.tracking_link &&
                pkg?.tracking_link !== null &&
                pkg.tracking_link.length > 0 &&
                !user.channel
                  ? [
                      {
                        label: "Tracking Link",
                        value: pkg.tracking_link,
                      },
                    ]
                  : []),
                ...(!user.channel
                  ? [
                      {
                        label: "Item Url",
                        value: item.public_url,
                      },
                    ]
                  : []),
              ]
                .map(
                  (f) =>
                    `*${f.label}*${f.value.length > 0 ? ":" : ""} ${f.value}`,
                )
                .join("\n");
              await client.chat.postMessage({
                channel: user.channel ? user.channel : user.userId,
                text,
              });
            }
          }
        } else {
          for (const mailRow of mailRows) {
            const apiMail = apiMailViaId.get(mailRow.id);
            if (!apiMail) {
              continue;
            }
            if (
              mailRow.updated_at.getTime() ===
              new Date(apiMail.updated_at).getTime()
            )
              continue;

            const isPackage =
              mailRow.type === "package" || mailRow.type === "warehouse_order";
            const pkg = isPackage ? packageDetails.get(mailRow.id) : undefined;
            const changes: {
              label: string;
              from: string;
              to: string;
              hideInChannel?: boolean;
            }[] = [];
            const checkAgainstDB = (
              label: string,
              dbv: string | null | undefined,
              apiv: string | null | undefined,
              hideInChannel?: boolean,
            ) => {
              if (dbv !== apiv) {
                changes.push({
                  label,
                  from: dbv ?? "(none)",
                  to: apiv ?? "(none)",
                  hideInChannel: hideInChannel ? hideInChannel : false,
                });
                return true;
              } else return false;
            };

            checkAgainstDB("Title", mailRow.title, apiMail.title);
            checkAgainstDB("Status", mailRow.status, apiMail.status);
            checkAgainstDB("URL", mailRow.public_url, apiMail.public_url, true);
            checkAgainstDB(
              "Dispatched At",
              mailRow.dispatched_at
                ? mailRow.dispatched_at.toISOString()
                : null,
              apiMail.dispatched_at ?? null,
            );
            checkAgainstDB(
              "Mailed At",
              mailRow.mailed_at ? mailRow.mailed_at.toISOString() : null,
              apiMail.mailed_at ?? null,
            );
            checkAgainstDB("Carrier", mailRow.carrier, apiMail.carrier ?? null);
            checkAgainstDB("Service", mailRow.service, apiMail.service ?? null);

            if (isPackage) {
              checkAgainstDB(
                "Tracking Number",
                mailRow.tracking_number,
                pkg?.tracking_number ?? null,
                true,
              );
              checkAgainstDB(
                "Tracking Link",
                mailRow.tracking_link,
                pkg?.tracking_link ?? null,
                true,
              );
            }

            if (changes.length > 0) {
              await pg
                .update(theseus)
                .set({
                  title: apiMail.title ?? "undefined",
                  status: apiMail.status,
                  public_url: apiMail.public_url,
                  updated_at: new Date(apiMail.updated_at),
                  dispatched_at: apiMail.dispatched_at
                    ? new Date(apiMail.dispatched_at)
                    : null,
                  mailed_at: apiMail.mailed_at
                    ? new Date(apiMail.mailed_at)
                    : null,
                  carrier: apiMail.carrier ?? null,
                  service: apiMail.service ?? null,
                  ...(isPackage && {
                    tracking_number: pkg?.tracking_number ?? null,
                    tracking_link: pkg?.tracking_link ?? null,
                  }),
                })
                .where(
                  and(
                    eq(theseus.userId, user.userId),
                    eq(theseus.id, mailRow.id),
                  ),
                );

              const text = [
                {
                  label: `${mailRow.title ? mailRow.title : mailRow.id} got an update!`,
                  value: "",
                },
                ...changes
                  .filter((c) => !(c.hideInChannel && user.channel?.length))
                  .map((c) => ({
                    label: c.label,
                    value: `${c.from} → ${c.to}`,
                  })),
                ...(!user.channel
                  ? [
                      {
                        label: "Item Url",
                        value: apiMail.public_url,
                      },
                    ]
                  : []),
              ]
                .map(
                  (f) =>
                    `*${f.label}*${f.value.length > 0 ? ":" : ""} ${f.value}`,
                )
                .join("\n");
              await client.chat.postMessage({
                channel: user.channel ? user.channel : user.userId,
                text,
              });
            }
          }
        }
      }
    } catch (err) {
      const ctx = logger.with({
        err,
        location: "scanTheseusForMail,topLevelTryCatch",
      })
      ctx.error("Theseus has failed to run because of an error occuring")
    }
  },
};
