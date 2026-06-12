import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? "127.0.0.1";

createApp().listen(port, host, () => {
  console.log(`WhiteBlue Hardware Test Site API service running on http://${host}:${port}`);
});
