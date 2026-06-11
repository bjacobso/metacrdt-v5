import { Impl } from "@confect/server";
import { Layer } from "effect";

import api from "./_generated/api";
import { compliance } from "./compliance.impl";
import { metacrdt } from "./metacrdt.impl";

export default Impl.make(api).pipe(
  Layer.provide(metacrdt),
  Layer.provide(compliance),
  Impl.finalize,
);
