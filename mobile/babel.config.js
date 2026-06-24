module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // reanimated: false — nativewind/babel owns the worklets/plugin to avoid duplication
      ["babel-preset-expo", { jsxImportSource: "nativewind", reanimated: false }],
      "nativewind/babel",
    ],
  };
};
