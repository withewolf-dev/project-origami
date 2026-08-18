import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { Pressable } from 'react-native';

import { ExpenseCalculator } from './src/demo/ExpenseCalculator';
import { Playground } from './src/devtools/tuner/Playground';
import { gateLog } from './src/gate';
import { ProgressScreen } from './src/screens/ProgressScreen';
import { RecapScreen } from './src/screens/RecapScreen';
import { SessionScreen } from './src/screens/SessionScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import type { SessionRecord } from './src/session/mockSession';
import type { TodaySummary } from './src/model/todaySummary';

type RootStackParamList = {
  Today: undefined;
  Session: undefined;
  Recap: { record: SessionRecord };
  Progress: undefined;
  // Dev-only design-tuner test bed; the screen is only registered in __DEV__.
  Playground: undefined;
  // Dev-only tuner demo: a realistic dark UI (Revolut-style calculator).
  ExpenseDemo: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Stand-in data until shot 07 (local persistence) lands.
 * A fresh install has no history, so launch shows the day-one empty state;
 * fill this in to preview the populated screen.
 */
const DEMO_SUMMARY: TodaySummary | undefined = undefined;

export default function App() {
  useEffect(() => {
    gateLog('app-launched');
  }, []);

  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator>
        <Stack.Screen
          name="Today"
          // A real navigation title, not a hand-drawn header: "where am I" is
          // answered at the top of the screen, by the system, with large-title
          // collapse-on-scroll behaviour intact.
          //
          // Progress is a toolbar action rather than a tab (see pass 2):
          // history is a view of the same content, not a section of the app.
          options={({ navigation }) => ({
            headerLargeTitle: true,
            // Dev builds get a left toolbar button into the tuner playground
            // (docs/tuner/TODO.md) — pure-RN views the design tuner can edit.
            headerLeft: __DEV__
              ? () => (
                  <Pressable
                    accessibilityLabel="Tuner playground"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => navigation.navigate('Playground')}>
                    <SymbolView name="slider.horizontal.3" size={22} tintColor={undefined} />
                  </Pressable>
                )
              : undefined,
            headerRight: () => (
              <Pressable
                accessibilityLabel="Progress"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => navigation.navigate('Progress')}>
                <SymbolView name="chart.bar" size={22} tintColor={undefined} />
              </Pressable>
            ),
          })}>
          {({ navigation }: NativeStackScreenProps<RootStackParamList, 'Today'>) => (
            <TodayScreen
              summary={DEMO_SUMMARY}
              onStartSession={() => {
                gateLog('start-session-tapped');
                navigation.navigate('Session');
              }}
            />
          )}
        </Stack.Screen>
        <Stack.Screen
          name="Session"
          // A focused mode, not a place: full-screen, no title bar — the state
          // indicator is the orientation (see session-pass2-structure.md).
          options={{ presentation: 'fullScreenModal', headerShown: false }}>
          {({ navigation }: NativeStackScreenProps<RootStackParamList, 'Session'>) => (
            <SessionScreen
              // Recap replaces Session inside the same full-screen presentation
              // (see recap-pass2-structure.md) — complete or partial alike.
              onDone={(record) => navigation.replace('Recap', { record })}
            />
          )}
        </Stack.Screen>
        <Stack.Screen
          name="Recap"
          // A place again after the title-less Session mode, so the toolbar
          // rule applies: a real title. Back is hidden — Done is the exit.
          options={{
            presentation: 'fullScreenModal',
            headerLargeTitle: true,
            title: 'Recap',
            headerBackVisible: false,
            gestureEnabled: false,
          }}>
          {({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Recap'>) => (
            <RecapScreen
              record={route.params.record}
              onDone={() => navigation.popToTop()}
            />
          )}
        </Stack.Screen>
        <Stack.Screen
          name="Progress"
          // A pushed place with system back — history elaborates Today.
          options={{ headerLargeTitle: true, title: 'Progress' }}
          component={ProgressScreen}
        />
        {__DEV__ ? (
          <Stack.Screen name="Playground" options={{ title: 'Playground' }}>
            {({ navigation }: NativeStackScreenProps<RootStackParamList, 'Playground'>) => (
              <Playground onOpenDemo={() => navigation.navigate('ExpenseDemo')} />
            )}
          </Stack.Screen>
        ) : null}
        {__DEV__ ? (
          <Stack.Screen
            name="ExpenseDemo"
            // Full-bleed dark screen with its own ✕ — no system chrome.
            // NOT a fullScreenModal: native-stack modals render in a separate
            // native container ABOVE the root view, which puts them above the
            // tuner overlay — design mode cannot reach a modal. (Known tuner
            // limitation; also applies to Session/Recap.)
            options={{ headerShown: false }}>
            {({ navigation }: NativeStackScreenProps<RootStackParamList, 'ExpenseDemo'>) => (
              <ExpenseCalculator onClose={() => navigation.goBack()} />
            )}
          </Stack.Screen>
        ) : null}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
