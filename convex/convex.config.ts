import { defineApp } from "convex/server";
import selfHosting from "@convex-dev/static-hosting/convex.config.js";
import metacrdtConvex from "@metacrdt/convex/convex.config.js";

const app = defineApp();
app.use(selfHosting);
app.use(metacrdtConvex, { name: "metacrdt" });

export default app;
