import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import FT from "../lib/ft";
import { eq, sql } from "drizzle-orm";
import { users } from "../schema/users";
import { projects } from "../schema/projects";
import type { RequestHandler } from "..";

const tableMap = {
  users,
  projects,
};

function castValue(column: any, value: string): unknown {
  switch (column.dataType) {
    case "number":
      return Number(value);
    case "boolean":
      return value === "true" || value === "1";
    case "date":
    case "timestamp":
      return new Date(value).toISOString();
    case "array":
      return value
        .split(",")
        .map((v) =>
          castValue({ dataType: column.baseColumn.dataType }, v.trim()),
        );
    default:
      return value;
  }
}

export default {
  name: "drop",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    {
      pg,
      logger,
      prefix,
    }: RequestHandler,
  ) => {
    if (!["U08D3AY7BG8", "U0A0319L8JY"].includes(command.user_id))
      return respond({
        text: "You aren't in the developer id list meaning you can't run this command.",
        response_type: "ephemeral",
      });
    if (!prefix!.includes("devpheus")) {
      return respond({
        text: "You can't run this command as it's not in the development version.",
        response_type: "ephemeral",
      });
    }

    const [tableName, filterColumnName, filterValue, columnName, ...values] =
      command.text.trim().split(" ").filter(Boolean);
    if (
      !tableName ||
      !filterColumnName ||
      !filterValue ||
      !columnName ||
      values.length === 0
    ) {
      return respond({
        text: "Usage: /drop <table> <filterColumn> <filterValue> <column> [values...]",
      });
    }

    try {
      const table = tableMap[tableName as keyof typeof tableMap];
      if (!table)
        return respond({
          text: `Table doesn't exist, Available tables are: ${Object.keys(tableMap).join(", ")}`,
          response_type: "ephemeral",
        });

      const filterColumn = table[filterColumnName as keyof typeof table] as any;
      if (!filterColumn)
        return respond({
          text: `Columns doesn't exist, Available columns are: ${Object.keys(table).join(", ")}`,
          response_type: "ephemeral",
        });

      const column = table[columnName as keyof typeof table] as any;
      if (!column)
        return respond({
          text: `Columns doesn't exist, Available columns are: ${Object.keys(table).join(", ")}`,
          response_type: "ephemeral",
        });

      const castedFilter = castValue(filterColumn, filterValue);
      const isArr = column.dataType === "array";
      const updated: unknown[] = [];

      for (const value of values) {
        const casted = castValue(
          isArr ? { dataType: column.baseColumn.dataType } : column,
          value,
        );
        const newValue = isArr
          ? sql`array_remove(${column}, ${casted})`
          : sql`NULL`;

        const result = await pg
          .update(table)
          .set({ [columnName]: newValue })
          .where(eq(filterColumn, castedFilter))
          .returning();

        updated.push(...result);
      }

      return respond({
        text: `Updated ${updated.length} row(s) in \`${tableName}\`: removed [${values.join(", ")}] from \`${columnName}\` where \`${filterColumnName}\` = \`${filterValue}\``,
        response_type: "ephemeral",
      });
    } catch (err) {
      const ctx = logger.with({
        data: {
          user: command.user_id,
          username: command.user_name,
          channel: command.channel_id,
          channelName: command.channel_name,
        },
      });

      ctx.error({
        error: err,
      });

      return respond({
        text: "Unexpected Error has occurred.",
        response_type: "ephemeral",
      });
    }
  },
};
