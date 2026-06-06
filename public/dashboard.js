async function loadStats() {
  const res = await fetch("/api/status");
  const data = await res.json();

  document.getElementById("status").innerText = data.status;
  document.getElementById("uptime").innerText =
    Math.floor(data.uptime) + " seconds";

  document.getElementById("servers").innerText = data.servers;
  document.getElementById("users").innerText = data.users;
}

loadStats();
setInterval(loadStats, 5000);
