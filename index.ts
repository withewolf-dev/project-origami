import { registerRootComponent } from 'expo';

import App from './App';
import { withTuner } from './src/devtools/tuner';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
//
// withTuner mounts the dev-only design tuner (docs/tuner/TODO.md) around the
// app; it returns App unchanged in production builds.
registerRootComponent(withTuner(App));
