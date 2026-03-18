export interface NoteRecord {
  id: string;
  title: string;
}

const NOTES: NoteRecord[] = [{ id: "note-1", title: "Ship docs" }];

export function listNotes(): NoteRecord[] {
  return [...NOTES];
}

export function createNote(input: { title: string }): NoteRecord {
  const note = {
    id: `note-${NOTES.length + 1}`,
    title: input.title,
  };

  NOTES.push(note);
  return note;
}
