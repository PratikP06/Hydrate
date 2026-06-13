const vscode = require("vscode");

function activate(context) {
  let timeInterval = null;
  let nextReminderAt = null;
  let sipCount = context.globalState.get("sipCount", 0);

  function getIntervalMs() {
    const config = vscode.workspace.getConfiguration("siptracker");
    const minutes = config.get("sipInterval");
    return minutes * 60 * 1000;
  }

  function getIntervalMsg() {
    const config = vscode.workspace.getConfiguration("siptracker");
    return config.get("sipMsg");
  }

  // --- Status Bar ---
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBar.text = "💧 --:--";
  statusBar.tooltip = "Sip Tracker - Click for stats";
  statusBar.command = "siptracker.showStats";
  statusBar.show();

  // updates every second
  const countdownTick = setInterval(() => {
    if (nextReminderAt) {
      const remaining = nextReminderAt - Date.now();
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      statusBar.text = `💧 ${minutes}:${seconds.toString().padStart(2, "0")}`;
    }
  }, 1000);

  // --- Config change listener ---
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (
      e.affectsConfiguration("siptracker.sipInterval") ||
      e.affectsConfiguration("siptracker.sipMsg")
    ) {
      stopInterval();
      startInterval();
      vscode.window.showInformationMessage("Settings updated successfully");
    }
  });

  function startInterval() {
    nextReminderAt = Date.now() + getIntervalMs(); // set when next reminder fires
    console.log("interval ms:", getIntervalMs()); // ← add this
    console.log("message:", getIntervalMsg()); // ← add this
    console.log("nextReminderAt:", nextReminderAt); // ← add this

    timeInterval = setInterval(() => {
      nextReminderAt = Date.now() + getIntervalMs(); // reset for next reminder

      vscode.window
        .showInformationMessage(getIntervalMsg(), "Done", "Snooze")
        .then((selection) => {
          if (selection == "Done") {
            sipCount++;
            context.globalState.update("sipCount", sipCount);
          } else if (selection == "Snooze") {
            stopInterval();
            nextReminderAt = Date.now() + 30 * 1000;
            setTimeout(() => startInterval(), 30 * 1000);
          }
        });

      console.log("notification sent");
    }, getIntervalMs());
  }

  function stopInterval() {
    if (timeInterval) {
      clearInterval(timeInterval);
      timeInterval = null;
    }
  }

  function scheduleMidnightReset() {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0); // next midnight

    const msUntilMidnight = midnight - now;
    console.log("resetting in ms:", msUntilMidnight);

    setTimeout(() => {
      sipCount = 0;
      context.globalState.update("sipCount", 0); // clear saved value too
      vscode.window.showInformationMessage("🌙 New day! Sip count reset.");
      scheduleMidnightReset(); // schedule next midnight reset
    }, msUntilMidnight);
  }

  scheduleMidnightReset();

  startInterval();

  // --- Commands ---
  const startCommand = vscode.commands.registerCommand(
    "siptracker.start",
    function () {
      stopInterval();
      startInterval();
      vscode.window.showInformationMessage("Reminder Started");
    },
  );

  const stopCommand = vscode.commands.registerCommand(
    "siptracker.stop",
    function () {
      stopInterval();
      nextReminderAt = null; // clear countdown
      statusBar.text = "💧 --:--";
      vscode.window.showInformationMessage("Reminder stopped");
    },
  );

  const resetCommand = vscode.commands.registerCommand(
    "siptracker.reset",
    function () {
      stopInterval();
      startInterval();
      vscode.window.showInformationMessage("Reminder reset");
    },
  );

  const showStatsCommand = vscode.commands.registerCommand(
    "siptracker.showStats",
    function () {
      // placeholder for now, we'll add glasses count here next
      const remaining = nextReminderAt ? nextReminderAt - Date.now() : 0;
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      vscode.window.showInformationMessage(
        `💧 Next sip in: ${minutes}:${seconds.toString().padStart(2, "0")} | Sip counts today : ${sipCount}`,
      );
    },
  );

  context.subscriptions.push(
    startCommand,
    stopCommand,
    resetCommand,
    showStatsCommand,
    statusBar,
    { dispose: () => clearInterval(countdownTick) },
    { dispose: () => stopInterval() },
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
