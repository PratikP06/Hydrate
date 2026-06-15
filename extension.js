const vscode = require("vscode");

function activate(context) {
  let timeInterval = null;
  let nextReminderAt = null;
  let sipCount = context.globalState.get("sipCount", 0);
  let totalSips = context.globalState.get("totalSips", 0);
  let xp = context.globalState.get("xp", 0);
  let level = context.globalState.get("level", 1);
  let streak = context.globalState.get("streak", 0);
  let maxStreak = context.globalState.get("maxStreak", 0);
  let lastActiveDate = context.globalState.get("lastActiveDate", "");
  let unlockedAchievements = new Set(
    context.globalState.get("unlockedAchievements", [])
  );
  const XP_PER_SIP = 10;

  // --- Startup date check ---
  const savedDate = context.globalState.get("sipDate", "");
  const today = new Date().toDateString();
  if (savedDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (lastActiveDate !== yesterday && lastActiveDate !== today) {
      streak = 0;
      context.globalState.update("streak", 0);
    }
    sipCount = 0;
    context.globalState.update("sipCount", 0);
    context.globalState.update("sipDate", today);
  }

  // --- Achievements list ---
  const ACHIEVEMENTS = [
    // sip based
    { id: "first_drop",        label: "First Drop 💧",         desc: "Drink your first sip",    check: () => totalSips >= 1 },
    { id: "hydration_starter", label: "Hydration Starter 🥤",  desc: "10 total sips",           check: () => totalSips >= 10 },
    { id: "century",           label: "Century 💯",             desc: "100 total sips",          check: () => totalSips >= 100 },
    { id: "hydration_hero",    label: "Hydration Hero 🦸",      desc: "500 total sips",          check: () => totalSips >= 500 },
    { id: "water_legend",      label: "Water Legend 🏆",        desc: "1000 total sips",         check: () => totalSips >= 1000 },

    // streak based
    { id: "on_a_roll",         label: "On a Roll 🔥",           desc: "3 day streak",            check: () => maxStreak >= 3 },
    { id: "week_warrior",      label: "Week Warrior ⚔️",        desc: "7 day streak",            check: () => maxStreak >= 7 },
    { id: "unstoppable",       label: "Unstoppable 🚀",         desc: "30 day streak",           check: () => maxStreak >= 30 },
    { id: "hydration_machine", label: "Hydration Machine 🤖",   desc: "100 day streak",          check: () => maxStreak >= 100 },

    // level based
    { id: "newcomer",          label: "Newcomer 🌱",            desc: "Reach Level 5",           check: () => level >= 5 },
    { id: "veteran",           label: "Hydration Veteran 🎖️",   desc: "Reach Level 10",          check: () => level >= 10 },
    { id: "elite",             label: "Elite Sipper 💎",        desc: "Reach Level 25",          check: () => level >= 25 },
    { id: "legendary",         label: "Legendary 👑",           desc: "Reach Level 50",          check: () => level >= 50 },
  ];

  function checkAchievements() {
    ACHIEVEMENTS.forEach((achievement) => {
      if (!unlockedAchievements.has(achievement.id) && achievement.check()) {
        unlockedAchievements.add(achievement.id);
        context.globalState.update(
          "unlockedAchievements",
          Array.from(unlockedAchievements)
        );
        vscode.window.showInformationMessage(
          `🏅 Achievement Unlocked: ${achievement.label} — ${achievement.desc}`
        );
      }
    });
  }

  function xpForLevel(lvl) {
    return Math.floor(50 * Math.pow(lvl, 1.4));
  }

  function updateStreak() {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    if (lastActiveDate === today) {
      return;
    } else if (lastActiveDate === yesterday) {
      streak++;
    } else {
      streak = 1;
    }

    // update maxStreak if current is higher
    if (streak > maxStreak) {
      maxStreak = streak;
      context.globalState.update("maxStreak", maxStreak);
    }

    lastActiveDate = today;
    context.globalState.update("streak", streak);
    context.globalState.update("lastActiveDate", today);
  }

  function addXP() {
    xp += XP_PER_SIP;
    context.globalState.update("xp", xp);

    if (xp >= xpForLevel(level)) {
      level++;
      context.globalState.update("level", level);
      vscode.window.showInformationMessage(
        `🎉 Level up! You're now Level ${level}!`
      );
      checkAchievements(); // catch level based achievements immediately
    }

    const currentLevelXp = xpForLevel(level - 1);
    const nextLevelXp = xpForLevel(level);
    const progress = Math.floor(
      ((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100
    );

    updateStatusBar();
    return progress;
  }

  function getIntervalMs() {
    const config = vscode.workspace.getConfiguration("siptracker");
    const minutes = config.get("sipInterval");

    // if (!minutes || minutes < 1) {
    //   vscode.window.showWarningMessage(
    //     "Sip Tracker: Invalid interval! Setting to 60 minutes."
    //   );
    //   return 60 * 60 * 1000;
    // }

    return minutes * 60 * 1000;
  }

  function getIntervalMsg() {
    const config = vscode.workspace.getConfiguration("siptracker");
    const msg = config.get("sipMsg");
    if (!msg || msg.trim() === "") {
      return "Time to drink water! 💧";
    }
    return msg;
  }

  // --- Status Bar ---
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBar.text = "💧 --:--";
  statusBar.tooltip = "Sip Tracker - Click for stats";
  statusBar.command = "siptracker.showStats";
  statusBar.show();

  function updateStatusBar() {
    if (nextReminderAt) {
      const remaining = nextReminderAt - Date.now();
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      statusBar.text = `💧 ${minutes}:${seconds.toString().padStart(2, "0")} | ⭐ Lvl ${level} | 🔥 ${streak}`;
    }
  }

  const countdownTick = setInterval(() => {
    if (nextReminderAt) updateStatusBar();
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
    nextReminderAt = Date.now() + getIntervalMs();

    timeInterval = setInterval(() => {
      nextReminderAt = Date.now() + getIntervalMs();

      vscode.window
        .showInformationMessage(getIntervalMsg(), "Done", "Snooze")
        .then((selection) => {
          if (selection == "Done") {
            sipCount++;
            totalSips++;
            context.globalState.update("sipCount", sipCount);
            context.globalState.update("totalSips", totalSips);
            context.globalState.update("sipDate", new Date().toDateString());

            updateStreak();
            checkAchievements(); // check after streak + totalSips updated

            const progress = addXP();
            vscode.window.showInformationMessage(
              `💧 Nice! +${XP_PER_SIP} XP (${progress}% to Level ${level + 1}) | 🔥 ${streak} day streak`
            );
          } else if (selection == "Snooze") {
            stopInterval();

            vscode.window
              .showQuickPick(
                [
                  { label: "⏱ 15 minutes", ms: 15 * 60 * 1000 },
                  { label: "⏱ 30 minutes", ms: 30 * 60 * 1000 },
                  { label: "⏱ 45 minutes", ms: 45 * 60 * 1000 },
                ],
                { placeHolder: "Snooze for how long?" }
              )
              .then((choice) => {
                if (choice) {
                  nextReminderAt = Date.now() + choice.ms;
                  setTimeout(() => startInterval(), choice.ms);
                } else {
                  startInterval();
                }
              });
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
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight - Date.now();

    setTimeout(() => {
      if (sipCount === 0) {
        streak = 0;
        context.globalState.update("streak", 0);
      }
      sipCount = 0;
      context.globalState.update("sipCount", 0);
      vscode.window.showInformationMessage("🌙 New day! Sip count reset.");
      scheduleMidnightReset();
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
    }
  );

  const stopCommand = vscode.commands.registerCommand(
    "siptracker.stop",
    function () {
      stopInterval();
      nextReminderAt = null;
      statusBar.text = "💧 --:--";
      vscode.window.showInformationMessage("Reminder stopped");
    }
  );

  const resetCommand = vscode.commands.registerCommand(
    "siptracker.reset",
    function () {
      stopInterval();
      startInterval();
      vscode.window.showInformationMessage("Reminder reset");
    }
  );

  const showStatsCommand = vscode.commands.registerCommand(
    "siptracker.showStats",
    function () {
      const remaining = nextReminderAt ? nextReminderAt - Date.now() : 0;
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);

      const currentLevelXp = xpForLevel(level - 1);
      const nextLevelXp = xpForLevel(level);
      const progress = Math.floor(
        ((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100
      );

      vscode.window.showInformationMessage(
        `💧 Next sip in: ${minutes}:${seconds.toString().padStart(2, "0")} | 🥛 ${sipCount} sips today | ⭐ Lvl ${level} (${progress}%) | 🔥 ${streak} day streak`
      );
    }
  );

  const showAchievementsCommand = vscode.commands.registerCommand(
    "siptracker.showAchievements",
    function () {
      const items = ACHIEVEMENTS.map((a) => ({
        label: unlockedAchievements.has(a.id) ? a.label : `🔒 ${a.desc}`,
        description: unlockedAchievements.has(a.id) ? "✅ Unlocked" : "Locked",
      }));

      vscode.window.showQuickPick(items, {
        placeHolder: `Achievements — ${unlockedAchievements.size}/${ACHIEVEMENTS.length} unlocked`,
        canPickMany: false,
      });
    }
  );

  context.subscriptions.push(
    startCommand,
    stopCommand,
    resetCommand,
    showStatsCommand,
    showAchievementsCommand,
    statusBar,
    { dispose: () => clearInterval(countdownTick) },
    { dispose: () => stopInterval() }
  );
}

function deactivate() {}

module.exports = { activate, deactivate };