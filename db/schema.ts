import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const dataVersions = sqliteTable("data_versions", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  objectKey: text("object_key").notNull(),
  createdAt: text("created_at").notNull(),
  uploadedBy: text("uploaded_by"),
  sizeBytes: integer("size_bytes").notNull(),
  rowCount: integer("row_count").notNull(),
  stageNames: text("stage_names").notNull(),
  dataJson: text("data_json").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
});
