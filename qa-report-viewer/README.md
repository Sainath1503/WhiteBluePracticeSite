# WhiteBlue Automation Console

Standalone JavaFX utility for opening WhiteBlue QA artifacts without mixing desktop code into the Node.js application or test suites.

The viewer can also start and stop the WhiteBlue service, show the app/payment Swagger URLs in the main text area, and run the QA framework commands from a dropdown. The test runner includes all tests plus the unit, integration, contract, coverage, E2E, load, and report-generation commands used by this project. `All Tests` runs local checks in parallel with fail-fast behavior, and the `Stop` button terminates the active command while releasing spawned resources.

## Build

```powershell
npm run build:qa-report-viewer
```

The generated launcher is published to the repository root:

```text
WhiteBlueAutomationConsole.exe
```

`npm run build` also rebuilds and republishes the viewer after TypeScript compilation. The root-level launcher depends on the adjacent generated `app` and `runtime` folders, so keep those together when moving the project folder. The viewer discovers the repository by searching upward from the launch location and application files for `qa-artifacts`; it does not use machine-specific report paths.
