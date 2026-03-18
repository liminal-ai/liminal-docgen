import { createNote, listNotes, type NoteRecord } from "../store.js";
import { normalizeNoteInput } from "../validation.js";

export function createNotesRouter() {
  return {
    create(input: { title: string }): NoteRecord {
      return createNote(normalizeNoteInput(input));
    },
    list(): NoteRecord[] {
      return listNotes();
    },
  };
}
