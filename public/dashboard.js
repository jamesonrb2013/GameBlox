async function loadStats() {
  const res = await fetch("/api/status");
  const data = await res.json();

  document.getElementById("status").innerText = data.status;
  document.getElementById("uptime").innerText =
    Math.floor(data.uptime) + "s";

  document.getElementById("servers").innerText = data.servers;
  document.getElementById("users").innerText = data.users;
}

async function loadUser() {
  const res = await fetch("/api/user");
  const user = await res.json();

  if (!user || !user.loggedIn) {
    window.location.href = "/auth/discord";
    return;
  }

  document.getElementById("userInfo").innerHTML = `
    <img src="${user.avatar}" style="width:40px;height:40px;border-radius:50%;vertical-align:middle;margin-right:10px;">
    <strong>${user.username}</strong>
    ${user.isAdmin ? '<span class="admin-badge">ADMIN</span>' : ''}
  `;

  checkAdmin(user.id);
}

function checkAdmin(userId) {
  const ADMIN_IDS = [
    "1441223435043868735",
    "1506069255484084354"
  ];

  const panel = document.getElementById("adminPanel");

  if (ADMIN_IDS.includes(userId)) {
    panel.style.display = "block";
  } else {
    panel.style.display = "none";
  }
}

async function init() {
  await loadStats();
  await loadUser();

  setInterval(loadStats, 5000);
}

document.getElementById("toggleXP").addEventListener("click", async () => {
    await fetch("/api/toggle/xp", { method: "POST" });
    alert("XP system toggled");
});

document.getElementById("toggleAutomod").addEventListener("click", async () => {
    await fetch("/api/toggle/automod", { method: "POST" });
    alert("Automod toggled");
});

init();