# Focusapp

Focusapp is a simple desktop productivity timer for planning and finishing focused work sessions. It lets you build a small task queue, run one timer at a time, track completed tasks, and keep your settings saved locally.

The app is built with Tauri, React, TypeScript, Tailwind CSS, Zustand, and SQLite.

## Features

- Add tasks with a name, emoji, and duration.
- Start, pause, resume, reset, and complete the active timer.
- Move queued tasks around with drag and drop.
- Edit or delete queued tasks before they start.
- See total queue time and estimated finish time.
- Use built-in preset routines:
  - Deep Work
  - Job Search
  - Study Session
  - Morning Routine
- Clear queued or completed tasks.
- Choose from multiple themes.
- Turn sound, confetti, and overtime mode on or off.
- Save tasks and settings locally.

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

In the desktop app, Focusapp stores tasks and settings in a local SQLite database named `focusapp.db` inside the app data directory.

When running in a browser-only development environment, the app falls back to `localStorage`.

The app also includes a small migration path for older database locations. If an old database exists in the previous app config directory, it is copied into the current app data directory on first launch.

## How to Use

1. Add a task with a name, emoji, and duration.
2. Add more tasks or choose a preset routine.
3. Press play to start the next task.
4. Pause, resume, reset, or adjust the timer as needed.
5. Mark the task complete when it is finished.
6. Review completed tasks or clear them when you are done.

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
src-tauri/target/release/bundle/deb/Focusapp_0.1.0_amd64.deb
```

Install it locally:

```sh
sudo apt install ./src-tauri/target/release/bundle/deb/Focusapp_0.1.0_amd64.deb
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

- This project is private and currently marked as version `0.1.0`.
- The Tauri window is configured for a compact timer layout.
- Generated folders such as `dist/`, `node_modules/`, and `src-tauri/target/` should not be edited by hand.
