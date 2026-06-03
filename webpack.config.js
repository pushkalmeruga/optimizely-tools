const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

module.exports = (env) => {
  // env.entry:   absolute path to the source file (js/scss)
  // env.destination: output directory for this file
  // env.filename: target JS filename (e.g., control.js, variation-1.js)
  if (!env.entry || !env.destination || !env.filename) {
    throw new Error("Missing required webpack env values: entry, destination, filename.");
  }

  // Derive the entry/chunk name from the target filename (without extension).
  const entryName = path.parse(env.filename).name;
  const isStyleEntry = /\.(scss|css)$/i.test(env.entry);

  return {
    mode: "production",
    target: ["web", "es2015"],
    context: path.dirname(env.entry),
    devtool: false,

    // IMPORTANT: use an object entry so the chunk has a name
    entry: {
      [entryName]: env.entry,
    },

    output: {
      path: path.resolve(env.destination),
      // CSS entries emit their real payload through the local CSS output loader.
      // The JS stub is ignored because the extension reads env.filename.
      filename: isStyleEntry ? `${entryName}.js` : env.filename,
    },

    optimization: {
      minimize: true,
      usedExports: true,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            ecma: 2015,
            compress: {
              dead_code: true,
              drop_console: false,
              drop_debugger: true,
              passes: 1,
              unused: true
            },
            mangle: false,
            format: {
              beautify: true,
              comments: false,
            },
          },
        }),
      ],
    },

    module: {
      rules: [
        {
          test: /\.m?js$/,
          exclude: /node_modules/,
          use: {
            loader: "babel-loader",
            options: {
              babelrc: false,
              configFile: false,
              presets: [
                [
                  "@babel/preset-env",
                  {
                    bugfixes: true,
                    modules: false,
                    targets: {
                      esmodules: true,
                    },
                  },
                ],
              ],
            },
          },
        },
        {
          test: /\.scss$/,
          exclude: [/node_modules/],
          use: [
            {
              loader: path.resolve(__dirname, "loaders", "optimizely-css-output-loader.js"),
              options: {
                filename: env.filename,
              },
            },
            {
              loader: "sass-loader",
              options: {
                sourceMap: false,
              },
            },
          ],
        },
        {
          test: /\.css$/,
          exclude: [/node_modules/],
          use: [
            {
              loader: path.resolve(__dirname, "loaders", "optimizely-css-output-loader.js"),
              options: {
                filename: env.filename,
              },
            },
          ],
        },
      ],
    },

    resolve: {
      extensions: [".js", ".scss", ".css"],
      modules: [path.resolve(__dirname, "node_modules"), "node_modules"],
    },

    resolveLoader: {
      modules: [path.resolve(__dirname, "node_modules"), "node_modules"],
    },
  };
};
