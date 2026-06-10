import { defineApp } from "convex/server";
import selfHosting from "@convex-dev/static-hosting/convex.config.js";
import betterAuth from "@convex-dev/better-auth/convex.config";
import metacrdtConvex from "@metacrdt/convex/convex.config.js";

const app = defineApp();
app.use(selfHosting);
app.use(metacrdtConvex, { name: "metacrdt" });
app.use(betterAuth);

export default app;
