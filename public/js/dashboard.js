document.getElementById("tokenNo").textContent = String(Math.floor(100 + Math.random() * 900));

fetch("/api/auth/me").then(r => r.json()).then(d => {
  if (!d.user) {
    window.location.href = "/login.html";
    return;
  }
  document.getElementById("whoami").textContent = d.user.username;
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login.html";
});

const locationPill = document.getElementById("locationPill");
const essentialsSection = document.getElementById("essentialsSection");
const essentialsGrid = document.getElementById("essentialsGrid");

function setLocationPill(state, text) {
  if (state === "on") {
    locationPill.className = "location-pill on";
  } else {
    locationPill.className = "location-pill off";
  }
  locationPill.innerHTML = `<span class="dot"></span> ${text}`;
}

async function loadEssentials(lat, lon) {
  try {
    const res = await fetch(`/api/offices/essentials?lat=${lat}&lon=${lon}`);
    const data = await res.json();
    essentialsGrid.innerHTML = "";
    data.forEach(({ label, office }) => {
      const card = document.createElement("div");
      card.className = "essential-card";
      if (office) {
        card.innerHTML = `
          <div class="essential-label">${label}</div>
          <div class="essential-name">${office.name}</div>
          <div class="essential-dist">${office.distance_km} km away</div>
          <div class="essential-links">
            <a href="${office.map_link}" target="_blank" rel="noopener">Maps</a>
            <a href="${office.bhuvan_link}" target="_blank" rel="noopener">Bhuvan</a>
          </div>`;
      } else {
        card.innerHTML = `
          <div class="essential-label">${label}</div>
          <div class="essential-name" style="color:var(--text-muted);">Not in database yet</div>`;
      }
      essentialsGrid.appendChild(card);
    });
    essentialsSection.style.display = "block";
  } catch (e) {
    // Silently skip - the two service windows above still work without this panel.
  }
}

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setLocationPill("on", "Location on — showing what's near you below");
      loadEssentials(pos.coords.latitude, pos.coords.longitude);
    },
    () => {
      setLocationPill("off", "Location not shared — allow it to see nearby offices here");
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
} else {
  setLocationPill("off", "Location not available in this browser");
}
