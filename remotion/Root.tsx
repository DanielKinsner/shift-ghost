import React from "react";
import { Composition } from "remotion";
import { ShiftGhostExplainer } from "./ShiftGhostExplainer";
import { defaultExplainerProps, EXPLAINER_DURATION, EXPLAINER_FPS, explainerSchema } from "./schema";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ShiftGhostExplainer"
        component={ShiftGhostExplainer}
        durationInFrames={EXPLAINER_DURATION}
        fps={EXPLAINER_FPS}
        width={1920}
        height={1080}
        schema={explainerSchema}
        defaultProps={defaultExplainerProps}
      />
      <Composition
        id="ShiftGhostExplainerVertical"
        component={ShiftGhostExplainer}
        durationInFrames={EXPLAINER_DURATION}
        fps={EXPLAINER_FPS}
        width={1080}
        height={1920}
        schema={explainerSchema}
        defaultProps={defaultExplainerProps}
      />
    </>
  );
};
