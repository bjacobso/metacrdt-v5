import { Conformance } from "./sections/Conformance";
import { FirstPrinciples } from "./sections/FirstPrinciples";
import { Footer } from "./sections/Footer";
import { Hero } from "./sections/Hero";
import { Layers } from "./sections/Layers";
import { Meta } from "./sections/Meta";
import { Problem } from "./sections/Problem";
import { Protocol } from "./sections/Protocol";
import { Status } from "./sections/Status";

export function App() {
  return (
    <main>
      <Hero />
      <Problem />
      <FirstPrinciples />
      <Protocol />
      <Meta />
      <Layers />
      <Conformance />
      <Status />
      <Footer />
    </main>
  );
}
