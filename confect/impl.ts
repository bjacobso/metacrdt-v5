import { Impl } from "@confect/server";
import { Layer } from "effect";

import api from "./_generated/api";
import { metacrdt } from "./metacrdt.impl";

export default Impl.make(api).pipe(Layer.provide(metacrdt), Impl.finalize);
