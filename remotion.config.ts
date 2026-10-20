import { Config } from "@remotion/cli/config";

// Compositions live in /remotion so they can share /public with the Next app.
Config.setEntryPoint("remotion/index.ts");
// Keep clear of the Next dev server on :3000.
Config.setStudioPort(3100);
Config.setRendererPort(3123);
