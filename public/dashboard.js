async function loadStatus() {
  const res = await fetch("/api/status");
  const data = await res.json();

  document.getElementById("status").innerText = data.status;
  document.getElementById("uptime").innerText =
    Math.floor(data.uptime) + " seconds";
}

loadStatus();
setInterval(loadStatus, 5000);
