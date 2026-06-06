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

  if (!user) {
    document.getElementById("userInfo").innerText = "Not logged in";
    return;
  }

  document.getElementById("userInfo").innerText =
    `${user.username}#${user.id}`;
}

function checkAdmin(userId) {
  const ADMIN_ID = "1441223435043868735";

  if (userId === ADMIN_ID) {
    document.getElementById("adminPanel").style.display = "block";
  }
}

async function init() {
  await loadStats();

  const res = await fetch("/api/user");
  const user = await res.json();

  if (user) {
    loadUser();
    checkAdmin(user.id);
  }

  setInterval(loadStats, 5000);
}

init();
