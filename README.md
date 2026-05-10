# Focusapp

Focusapp is a compact desktop timer for focused work, flexible focus sessions, and intentional leisure limits. It lets you build a task queue, run focus without a task, review day-by-day productivity history, and track No-count time from Pastime Control separately.

The app is built with Tauri, React, TypeScript, Tailwind CSS, Zustand, and SQLite.

Current version: `0.2.0`

## Features

- Add tasks with a name, emoji, and duration.
- Start, pause, resume, reset, and complete the active timer.
- Move queued tasks around with drag and drop.
- Edit or delete queued tasks before they start.
- See total queue time and estimated finish time.
- Run a no-task focus timer with a custom break reminder.
- Use Pastime Control to limit gaming, social media, binge watching, series, or other leisure.
- Repeat the chime when a task, focus interval, or Pastime Control limit needs attention.
- Review day-by-day Productivity History.
- Review No-count history separately from productivity totals.
- Use built-in preset routines:
  - Deep Work
  - Job Search
  - Study Session
  - Morning Routine
- Clear queued or completed tasks.
- Choose from multiple themes.
- Turn sound, confetti, and overtime mode on or off.
- Save tasks, settings, productivity history, and No-count history locally.

## Tech Stack

- Tauri 2 for the desktop shell
- React 19 for the user interface
- TypeScript for type-safe app code
- Vite for local development and builds
- Tailwind CSS for styling
- Zustand for state management
- SQLite through the Tauri SQL plugin for desktop persistence

## Requirements

Before running the app, install:

- Node.js
- npm
- Rust
- Tauri system dependencies for your operating system

For Linux, Tauri may require WebKit and other native packages. Follow the official Tauri setup guide for your distribution if the desktop app does not start.

## Getting Started

Install dependencies:

```sh
npm install
```

Run the web app in development mode:

```sh
npm run dev
```

Run the desktop app in development mode:

```sh
npm run tauri dev
```

## Available Scripts

```sh
npm run dev
```

Starts the Vite development server.

```sh
npm run build
```

Runs TypeScript checks and builds the frontend into `dist/`.

```sh
npm run preview
```

Serves the built frontend locally for preview.

```sh
npm run tauri dev
```

Starts the full Tauri desktop app in development mode.

```sh
npm run tauri build
```

Builds a desktop app package through Tauri.

```sh
npm test
```

Runs the time-formatting tests.

## Project Structure

```txt
.
|-- src/                 React app source
|   |-- App.tsx          Main interface
|   |-- constants.ts     Default settings and preset routines
|   |-- hooks/           Timer hook
|   |-- lib/             Storage and time helpers
|   |-- store/           Zustand focus store
|   `-- types.ts         Shared TypeScript types
|-- src-tauri/           Tauri desktop app source
|   |-- src/             Rust commands and Tauri setup
|   `-- tauri.conf.json  Desktop app configuration
|-- tests/               Node test files
|-- public/              Static assets
`-- package.json         npm scripts and dependencies
```

## Data Storage

In the desktop app, Focusapp stores tasks, settings, productivity history, and No-count history in a local SQLite database named `focusapp.db` inside the app data directory.

When running in a browser-only development environment, the app falls back to `localStorage`.

The app also includes a small migration path for older database locations. If an old database exists in the previous app config directory, it is copied into the current app data directory on first launch.

## How to Use

### Task Timer

1. Add a task with a name, emoji, and duration.
2. Add more tasks or choose a preset routine.
3. Press play to start the next task.
4. Pause, resume, reset, or adjust the timer as needed.
5. Mark the task complete when it is finished.
6. Review completed tasks or clear them when you are done.

### No-Task Focus Timer

1. Press **Start focus timer** when no task is active.
2. Choose after how many minutes you want the 5-minute break reminder.
3. Let the timer run while you focus.
4. When the interval is reached, the chime repeats until you press **Stop timer**.
5. This time counts toward Productivity History.

### Pastime Control

1. Press **Pastime Control** when no task or focus timer is active.
2. Choose a category: Game, Social media, Binge, Series, or Other.
3. Choose how many minutes you want to allow.
4. When the limit is reached, the chime repeats until you press **Stop Pastime Control**.
5. This time is recorded as **No-count** history and does not count toward productivity totals.

### History

Open **Productivity History** from the app header to see:

- Focused time by day.
- Total productive focus time.
- No-count time by day with a red **No-count** mark.
- Category breakdowns for Pastime Control sessions.

## Settings

Focusapp includes settings for:

- Theme
- Sound effects
- Confetti
- Default task duration
- Overtime mode

These settings are saved locally and restored when the app opens again.

## Testing

Run the test suite with:

```sh
npm test
```

The current tests cover time formatting, compact duration formatting, estimated finish text, and progress percentage calculations.

## Build

To build the frontend:

```sh
npm run build
```

To build the desktop app:

```sh
npm run tauri build
```

Build outputs are generated in `dist/` and `src-tauri/target/`.

## Linux Debian Package

Build a `.deb` package for Linux:

```sh
npm run tauri build -- --bundles deb
```

The generated Debian package is written to:

```txt
src-tauri/target/release/bundle/deb/Focusapp_0.2.0_amd64.deb
```

Install it locally:

```sh
sudo apt install ./src-tauri/target/release/bundle/deb/Focusapp_0.2.0_amd64.deb
```

After installation, the executable is available at:

```txt
/usr/bin/focusapp
```

You can launch it from a terminal with:

```sh
focusapp
```

The desktop launcher is installed at:

```txt
/usr/share/applications/Focusapp.desktop
```

If you copy `Focusapp.desktop` to `~/Desktop` on GNOME and see an "Untrusted Desktop File" message, right-click the desktop file and choose **Allow Launching**.

## Notes

- This project is private and currently marked as version `0.2.0`.
- The Tauri window is configured for a compact timer layout.
- Generated folders such as `dist/`, `node_modules/`, and `src-tauri/target/` should not be edited by hand.
