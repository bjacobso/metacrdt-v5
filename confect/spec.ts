import { Spec } from "@confect/core";

import { compliance } from "./compliance.spec";
import { metacrdt } from "./metacrdt.spec";

export default Spec.make().add(metacrdt).add(compliance);
