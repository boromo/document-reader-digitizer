import { getDb } from "../db/database.js";
import type { Tag } from "../types/models.js";

export function getAllTags(): Tag[] {
  const db = getDb();
  return db.prepare("SELECT * FROM tags ORDER BY name").all() as Tag[];
}

export function createTag(name: string): Tag {
  const db = getDb();
  const result = db.prepare("INSERT INTO tags (name) VALUES (?)").run(name);
  return db.prepare("SELECT * FROM tags WHERE id = ?").get(result.lastInsertRowid) as Tag;
}

export function getTagsForDocument(documentId: number): Tag[] {
  const db = getDb();
  return db.prepare(
    `SELECT t.* FROM tags t
     JOIN document_tags dt ON dt.tag_id = t.id
     WHERE dt.document_id = ?
     ORDER BY t.name`
  ).all(documentId) as Tag[];
}

export function setTagsForDocument(documentId: number, tagIds: number[]): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM document_tags WHERE document_id = ?").run(documentId);
    for (const tagId of tagIds) {
      db.prepare("INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)").run(documentId, tagId);
    }
  })();
}

export function addTagToDocument(documentId: number, tagId: number): void {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)").run(documentId, tagId);
}

export function removeTagFromDocument(documentId: number, tagId: number): void {
  const db = getDb();
  db.prepare("DELETE FROM document_tags WHERE document_id = ? AND tag_id = ?").run(documentId, tagId);
}
