module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Required for react-native-reanimated v4. Must be last in the list.
      'react-native-worklets/plugin',
    ],
  };
};
