const path = require('path');
const webpack = require('webpack');
const UglifyJSPlugin = require('uglifyjs-webpack-plugin');
const HTMLWebpackPlugin = require('html-webpack-plugin');
const glob = require('glob');

// Loaders handle certain extensions and apply transforms
function setupRules(env) {
  const rules = [];

  if (env.prod) {
    // TODO: If we want to add babel, uncomment this. Maybe add an IE flag to CME
    // Babelify all .js files for prod builds (except external modules)
    // rules.push({
    //   test: /\.js$/,
    //   exclude: /(node_modules|bower_components)/,
    //   use: [
    //     {
    //       loader: 'babel-loader',
    //       options: {
    //         presets: ['env']
    //       }
    //     }
    //   ]
    // });
  }

  return rules;
}

// Tell Webpack not to bundle these at all when required
// We have to add some core node libraries (fs, net, tls) because ripple-lib
// does not have browser-friendly builds
function setupExternals() {
  const externals = ['morgan', 'superagent-proxy'];

  // TODO: Bug ripple to make a browser-friendly build of ripple-lib?
  const nodeLibraries = ['fs', 'net', 'tls'];
  externals.push(...nodeLibraries);

  return externals;
}

/**
 * This feature is mostly for browsers where we don't want to have a build with coins that people don't need
 * In order to specify the coins you want, you must pass the --env.coins="csv coins" flag
 * If nothing is passed, all coins are going to be available.
 * In webpack, we have to define via plugin what we want.to exclude but also we want to include the coins if the
 * user didn't specify anything or in node environments
 * @param env
 * @returns [webpack.DefinePlugin]
 */
function getCoinsToExclude(env) {
  if (!env.coins) {
    return [];
  }

  const allCoins = ['btc', 'bch', 'bsv', 'btg', 'ltc', 'eth', 'rmg', 'xrp', 'xlm', 'dash', 'zec'];
  const compileCoins = env.coins.split(',').map(coin => coin.trim().toLowerCase());
  const invalidCoins = compileCoins.filter(allCoin => {
    return !allCoins.includes(allCoin);
  });

  if (invalidCoins.length) {
    throw new Error(`Invalid coins: ${invalidCoins.join(',')} \n Valid options are: ${allCoins.join(',')}`);
  }

  return allCoins.filter(allCoin => {
    return !compileCoins.includes(allCoin);
  })
  .map(coin => {
    return new webpack.DefinePlugin({
      'process.env': {
        [`BITGO_EXCLUDE_${coin.toUpperCase()}`]: JSON.stringify('exclude')
      }
    });
  });
}

// Used for extra processing that does not involve transpilation (e.g. minification)
function setupPlugins(env) {
  const excludeCoins = getCoinsToExclude(env);
  const plugins = [
    // This is for handling dynamic requires in third-party libraries
    // By default, webpack will bundle _everything_ that could possibly match the expression
    // inside a dynamic 'require'. This changes Webpack so that it bundles nothing.
    new webpack.ContextReplacementPlugin(/.*$/, /$NEVER_MATCH^/),
    ...excludeCoins
  ];

  if (!env.test) {
    // Create a browser.html which automatically includes BitGoJS
    plugins.push(new HTMLWebpackPlugin({ filename: 'browser.html', title: 'BitGo SDK Sandbox' }));
  }

  if (env.prod) {
    // Minimize output files in production
    plugins.push(new UglifyJSPlugin({
      uglifyOptions: {
        mangle: false
      }
    }));
  }


  return plugins;
}

// Test configuration - does not bundle main code, but merges all files in test/ to single output file
function getTestConfig(env) {
  return {
    // Take everything in the test directory
    entry: glob.sync(path.join(__dirname, 'test', '**', '*.js')),

    // Output everything into browser/tests.js
    output: {
      path: path.join(__dirname, 'browser'),
      filename: 'tests.js'
    },

    externals: setupExternals(env),
    plugins: setupPlugins(env)
  };
}

// Webpack configuration takes environment as argument, returns a config object
module.exports = function setupWebpack(env) {
  // If no env is provided, default to dev
  if (!env) {
    console.log('No environment provided - defaulting to dev. Use the npm `compile` tasks for a better build experience.');
    env = { dev: true };
  }

  if (env.test) {
    // Compile tests
    return getTestConfig(env);
  }

  // Compile source code
  return {
    // Main project entry point
    entry: path.join(__dirname, 'src', 'index.js'),

    // Output directory and filename
    // Library acts like 'standalone' for browserify, defines it globally if module system not found
    output: {
      path: path.join(__dirname, 'browser'),
      filename: env.prod ? 'BitGoJS.min.js' : 'BitGoJS.js',
      library: 'BitGoJS',
      libraryTarget: 'umd'
    },

    // All of our transpilation settings. Should really only need 'loaders' for now
    module: { rules: setupRules(env) },

    // Do not bundle these when encountered
    externals: setupExternals(env),

    // Any extra processing
    plugins: setupPlugins(env),

    // Create a source map for the bundled code (dev and test only)
    devtool: !env.prod && 'cheap-eval-source-map'
  };
};
