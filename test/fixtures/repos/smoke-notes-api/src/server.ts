import { createNotesRouter } from "./routes/notes.js";

export function buildServer() {
  const notesRouter = createNotesRouter();

  return {
    handleListRequest() {
      return notesRouter.list();
    },
    handleCreateRequest(title: string) {
      return notesRouter.create({ title });
    },
  };
}
