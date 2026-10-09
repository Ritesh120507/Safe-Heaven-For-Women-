window.addEventListener("load", () => {

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyDzSJPwBC1szW6yLs6wwWgj_RNPjW64ZI0",
  authDomain: "shesafe-d72a3.firebaseapp.com",
  projectId: "shesafe-d72a3",
  storageBucket: "shesafe-d72a3.firebasestorage.app",
  messagingSenderId: "11541245556",
  appId: "1:11541245556:web:bfff4cd49c7b15367fab21"
};

let fbApp, auth, db, fbReady = false;
try {
  fbApp = firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  fbReady = true;
  document.getElementById("fb-dot").classList.add("on");
  document.getElementById("fb-status").textContent = "Firebase connected";
} catch (e) {
  console.error("Firebase init failed:", e);
}

const state = {
  user: null, 
  reports: [], 
  pendingLatLng: null, 
  pendingType: null,
  userLocation: null 
};

// UI Helpers
function toast(msg) {
  const wrap = document.getElementById("toast-wrap");
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

function openModal(id) { 
  document.getElementById(id).classList.add("show"); 
}

function closeModal(id) { 
  document.getElementById(id).classList.remove("show"); 
  if (id === "zone-modal-overlay" && window.zoneTimer) {
     clearInterval(window.zoneTimer);
  }
}

document.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", () => closeModal(el.dataset.close)));

document.getElementById("nav-mobile-toggle").addEventListener("click", () => {
  document.getElementById("nav-links").classList.toggle("mobile-open");
});
document.querySelectorAll(".nav-link").forEach(l => l.addEventListener("click", () => document.getElementById("nav-links").classList.remove("mobile-open")));

// Update UI based on Auth State & Trust Score
function updateUserUI(user) {
  const authBtns = document.getElementById("auth-buttons");
  const profileCard = document.getElementById("auth-profile-card");
  const markSafeBtn = document.getElementById("mark-safe-btn");
  const reportDangerBtn = document.getElementById("report-danger-btn");
  const navSlot = document.getElementById("nav-user-slot");

  if (user) {
    authBtns.style.display = "none";
    profileCard.style.display = "block";
    
    let badgeHtml = state.user.trust >= 75 ? `<img src="medal-.png" class="trust-badge" title="Trust Guardian" alt="Guardian Badge">` : '';
    
    document.getElementById("user-display-name").innerHTML = `${user.displayName || "User"} ${badgeHtml}`;
    document.getElementById("user-email-phone").textContent = user.email || "Verified User";
    
    if (user.photoURL) {
      document.getElementById("user-avatar-container").innerHTML = `<img src="${user.photoURL}" class="user-avatar-img">`;
    }
    
    navSlot.innerHTML = `
      <div class="nav-user-pill" id="profile-pill" style="cursor:pointer;" title="Click to view Trust Score">
        <span style="font-weight:700; color:var(--theme-glow);">${(user.displayName||"U").charAt(0)}</span>
        <span style="color:var(--text-hi); display:flex; align-items:center;">${user.displayName||"User"} ${badgeHtml}</span>
      </div>`;
      
    document.getElementById("profile-pill").addEventListener("click", () => {
      toast(`Trust Score: ${state.user.trust}/100 | ${user.displayName}`);
    });

    markSafeBtn.disabled = false;
    reportDangerBtn.disabled = false;
    document.getElementById("pin-hint").innerHTML = "<span>Tap the map to select a location, then choose an action</span>";
  } else {
    authBtns.style.display = "flex";
    profileCard.style.display = "none";
    navSlot.innerHTML = `<a href="#hero" class="btn btn-primary" style="padding:0.4rem 0.9rem; min-height:34px;">Sign in</a>`;
    markSafeBtn.disabled = true;
    reportDangerBtn.disabled = true;
    document.getElementById("pin-hint").innerHTML = "<span>Sign in, then tap the map</span>";
  }
}

async function syncUser(firebaseUser) {
  if (!fbReady) return;
  const ref = db.collection("users").doc(firebaseUser.uid);
  let trustScore = 25; 
  let bannedUntilVal = 0;
  
  try {
    const doc = await ref.get();
    if (doc.exists) {
      trustScore = doc.data().trust ?? 25;
      bannedUntilVal = doc.data().bannedUntil ?? 0;
    } else {
      await ref.set({ trust: 25, displayName: firebaseUser.displayName, bannedUntil: 0 }, { merge: true });
    }
  } catch (error) {
    console.warn("User sync note:", error.message);
  }

  state.user = { 
    uid: firebaseUser.uid, 
    displayName: firebaseUser.displayName, 
    email: firebaseUser.email, 
    photoURL: firebaseUser.photoURL,
    trust: trustScore,
    bannedUntil: bannedUntilVal
  };
  updateUserUI(state.user);
}

document.getElementById("google-signin-btn").addEventListener("click", async () => {
  if (!fbReady) return toast("Firebase not ready");
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    const res = await auth.signInWithPopup(provider);
    await syncUser(res.user);
    toast(`Welcome, ${res.user.displayName}`);
  } catch (e) { toast("Sign in failed: " + e.message); }
});

document.getElementById("hero-logout-btn").addEventListener("click", () => {
  if (fbReady) auth.signOut().then(() => { state.user = null; updateUserUI(null); toast("Signed out"); });
});

if (fbReady) {
  auth.onAuthStateChanged(async (user) => {
    if (user) await syncUser(user);
  });
}

const map = L.map("map", { maxZoom: 22 }).setView([20.5937, 78.9629], 5);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { 
  maxZoom: 22,
  maxNativeZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
window.safeHeavenMap = map;

window.addEventListener("resize", () => { if(window.safeHeavenMap) window.safeHeavenMap.invalidateSize(); });
setTimeout(() => { if(window.safeHeavenMap) window.safeHeavenMap.invalidateSize(); }, 500);

map.on("click", (e) => {
  state.pendingLatLng = e.latlng;
  if(state.user) document.getElementById("pin-hint").innerHTML = `<span>✓ Location selected successfully</span>`;
});

let userMarker = null;
let userRadiusCircle = null;
let hasCenteredUser = false;
const PROXIMITY_RADIUS_METERS = 400; 

function setupGPS() {
  const badge = document.getElementById("gps-status-badge");
  
  if (!("geolocation" in navigator)) {
    if (badge) badge.textContent = "GPS not supported";
    return;
  }

  navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      state.userLocation = { lat, lng };

      if (badge) badge.textContent = `GPS Active (±${Math.round(pos.coords.accuracy)}m)`;

      const userLatLng = [lat, lng];
      if (!userMarker) {
        const userIcon = L.divIcon({
          className: "",
          html: '<div class="gps-user-marker"></div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });
        userMarker = L.marker(userLatLng, { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
        userMarker.bindTooltip("You are here", { direction: "top", offset: [0, -10] });
        
        userRadiusCircle = L.circle(userLatLng, {
          radius: pos.coords.accuracy || 30,
          color: "#38bdf8",
          fillColor: "#38bdf8",
          fillOpacity: 0.12,
          weight: 1
        }).addTo(map);
      } else {
        userMarker.setLatLng(userLatLng);
        userRadiusCircle.setLatLng(userLatLng);
        userRadiusCircle.setRadius(pos.coords.accuracy || 30);
      }

      if (!hasCenteredUser) {
        map.flyTo(userLatLng, 15, { duration: 1.5 });
        hasCenteredUser = true;
      }

      checkProximityAlerts();
    },
    (err) => {
      console.warn("GPS error:", err.message);
      if (badge) badge.textContent = "GPS Permission Required";
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
  );
}

document.getElementById("recenter-gps-btn").addEventListener("click", () => {
  if (state.userLocation) {
    map.flyTo([state.userLocation.lat, state.userLocation.lng], 16, { duration: 1.2 });
    toast("Centered on your GPS location");
  } else {
    toast("Acquiring GPS location, please wait...");
  }
});

function checkProximityAlerts() {
  if (!state.userLocation || !state.reports || state.reports.length === 0) {
    setProximityBanner(null);
    return;
  }

  const now = Date.now();
  const userLL = L.latLng(state.userLocation.lat, state.userLocation.lng);

  const activeReports = state.reports.filter(r => {
    let exp = r.expiresAt;
    if (exp && typeof exp.toMillis === "function") exp = exp.toMillis();
    else if (exp && exp.toDate) exp = exp.toDate().getTime();
    if (exp && exp < now) return false;
    return true;
  });

  let inDanger = false;
  let inSafe = false;

  for (const r of activeReports) {
    const reportLL = L.latLng(r.lat, r.lng);
    const distanceMeters = userLL.distanceTo(reportLL);

    if (distanceMeters <= PROXIMITY_RADIUS_METERS) {
      if (r.type === "danger") {
        inDanger = true;
        break; 
      } else if (r.type === "safe") {
        const totalWeight = (r.confirmations || []).reduce((acc, uid) => acc + (uid === "GUARDIAN_WEIGHT_BOOST" ? 1 : 1), 0);
        if (totalWeight >= 3) inSafe = true;
      }
    }
  }

  if (inDanger) {
    setProximityBanner("danger");
  } else if (inSafe) {
    setProximityBanner("safe");
  } else {
    setProximityBanner(null);
  }
}

function setProximityBanner(status) {
  const banner = document.getElementById("proximity-banner");
  const icon = document.getElementById("proximity-icon");
  const text = document.getElementById("proximity-text");
  if (!banner) return;

  if (status === "danger" && banner.className.indexOf("hidden") !== -1) {
    banner.className = "proximity-banner state-danger";
    icon.textContent = "⚠️";
    text.textContent = "Red Alert: Danger Zone Nearby!"; 
    if ("Notification" in window && Notification.permission === "granted") { new Notification("Safe Heaven", { body: text.textContent }); }
  } else if (status === "safe" && banner.className.indexOf("hidden") !== -1) {
    banner.className = "proximity-banner state-safe";
    icon.textContent = "";
    text.textContent = "You are in a verified safe zone"; 
    if ("Notification" in window && Notification.permission === "granted") { new Notification("Safe Heaven", { body: text.textContent }); }
  } else if (!status) {
    banner.className = "proximity-banner hidden";
  }
}

setupGPS();

async function updateUserTrustScore(userId, pointChange) {
  if (!userId) return;
  const userRef = db.collection('users').doc(userId);
  try {
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(userRef);
      if (doc.exists) {
        let currentScore = doc.data().trust || 25;
        let newScore = Math.max(0, Math.min(currentScore + pointChange, 100));
        transaction.update(userRef, { trust: newScore });
        if (state.user && state.user.uid === userId) {
          state.user.trust = newScore;
          updateUserUI(state.user);
        }
      }
    });
  } catch (error) { console.error("Trust update failed:", error); }
}

document.getElementById("mark-safe-btn").addEventListener("click", () => promptReport("safe"));
document.getElementById("report-danger-btn").addEventListener("click", () => promptReport("danger"));

function promptReport(type) {
  if (!state.pendingLatLng) return toast("Tap on the map first to pick a location");
  
  const now = Date.now();
  if (state.user && state.user.bannedUntil && state.user.bannedUntil > now) {
    const remainingMins = Math.ceil((state.user.bannedUntil - now) / 60000);
    return toast(`Anti-Spam: You are temporarily blocked from marking zones for another ${remainingMins} minutes.`);
  }

  state.pendingType = type;
  document.getElementById("report-modal-title").textContent = type === "danger" ? "Report Danger Zone" : "Mark Safe Zone (3 Confirmations Needed)";
  openModal("report-modal-overlay");
}

document.getElementById("report-confirm-btn").addEventListener("click", async () => {
  if (!fbReady || !state.user) return toast("Sign in first");
  const type = state.pendingType;
  const now = Date.now();

  if (type === "safe") {
    const thirtyMinsAgo = now - (30 * 60000);
    const recentSafeReports = state.reports.filter(r => 
      r.reportedBy === state.user.uid && 
      r.type === "safe" && 
      r.timestamp && 
      (r.timestamp.toMillis ? r.timestamp.toMillis() : (r.timestamp.seconds * 1000)) > thirtyMinsAgo
    );

    if (recentSafeReports.length >= 3) {
      const banUntil = now + (30 * 60000);
      const userRef = db.collection("users").doc(state.user.uid);
      
      try {
        await db.runTransaction(async (t) => {
          const uDoc = await t.get(userRef);
          let currentTrust = uDoc.exists ? (uDoc.data().trust || 25) : 25;
          let penalizedTrust = Math.max(0, currentTrust - 10);
          t.update(userRef, { trust: penalizedTrust, bannedUntil: banUntil });
          state.user.trust = penalizedTrust;
          state.user.bannedUntil = banUntil;
        });
      } catch (err) { console.error("Spam penalty error:", err); }

      closeModal("report-modal-overlay");
      return toast("Anti-Spam Triggered: You submitted >3 zones in 30 mins. Trust score penalized by 10 points and posting restricted for 30 minutes");
    }
  }

  const isGuardian = state.user.trust >= 75;
  const initialConfs = type === "safe" ? [state.user.uid] : [];
  
  // If Guardian marks the safe zone, give 2 votes right away (displayed as 2 of 3)
  if (type === "safe" && isGuardian) {
    initialConfs.push("GUARDIAN_WEIGHT_BOOST"); 
  }

  const report = {
    type,
    lat: state.pendingLatLng.lat,
    lng: state.pendingLatLng.lng,
    reportedBy: state.user.uid,
    reportedByName: state.user.displayName || "Anonymous",
    reporterTrust: state.user.trust, 
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    confirmations: initialConfs, 
    expiresAt: now + 30 * 60000 
  };

  try {
    await db.collection("reports").add(report);
    const displayConfs = initialConfs.length;
    toast(type === "danger" ? "Danger reported immediately" : (isGuardian ? "Safe zone submitted by Guardian (2 of 3 confirmed)!" : "Safe zone submitted (1 of 3 confirmed)"));
    state.pendingLatLng = null;
    document.getElementById("pin-hint").innerHTML = "<span>Tap anywhere on the map to select a location</span>";
    closeModal("report-modal-overlay");
  } catch (error) { 
    toast("Error: " + error.message); 
  }
});

async function confirmSafeZone(reportId) {
  if (!state.user) return toast("Sign in to confirm");
  const ref = db.collection("reports").doc(reportId);
  
  try {
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw "Report missing";
      const data = snap.data();
      const confs = data.confirmations || [];
      if (confs.includes(state.user.uid)) throw "Already confirmed";
      
      const newConfs = [...confs, state.user.uid];
      
      // If confirming user is a Guardian, add an extra vote weight (total 2 votes added for this user)
      if (state.user.trust >= 75) {
        newConfs.push("GUARDIAN_WEIGHT_BOOST");
      }

      // Calculate total weight (each entry counts as 1 vote)
      const totalWeight = newConfs.length;
      const updatePayload = { confirmations: newConfs };
      
      // Verified once total confirmation weight reaches 3 or more
      if (totalWeight >= 3) {
         updatePayload.expiresAt = Date.now() + 30 * 60000;
         updateUserTrustScore(data.reportedBy, 5); 
      }
      
      transaction.update(ref, updatePayload);
    });
    toast("Zone confirmed!");
    closeModal("zone-modal-overlay");
  } catch (error) { 
    toast(error.toString()); 
  }
}

function makeIcon(type, totalWeight) {
  let fill, ring, shadow;
  if (type === "danger") { 
    fill = "rgba(255, 77, 77, 0.9)"; ring = "#ff3333"; shadow = "0 0 15px rgba(255, 77, 77, 0.8)";
  } else if (totalWeight >= 3) { 
    fill = "rgba(77, 255, 136, 0.9)"; ring = "#33ff77"; shadow = "0 0 15px rgba(77, 255, 136, 0.8)";
  } else { 
    fill = "rgba(255, 214, 51, 0.9)"; ring = "#ffcc00"; shadow = "0 0 15px rgba(255, 204, 0, 0.8)"; 
  }
  
  return L.divIcon({
    className: "", html: `<div class="sh-marker" style="width:26px;height:26px;background:${fill};border-color:${ring};box-shadow:${shadow};"></div>`,
    iconSize: [26,26], iconAnchor: [13,13]
  });
}

function renderReports() {
  markerLayer.clearLayers();
  const list = document.getElementById("reports-list");
  list.innerHTML = "";
  const now = Date.now();

  const activeReports = state.reports.filter(r => {
    let exp = r.expiresAt;
    if (exp && typeof exp.toMillis === 'function') exp = exp.toMillis();
    else if (exp && exp.toDate) exp = exp.toDate().getTime();

    if (exp && exp < now) return false;
    return true;
  });

  document.getElementById("reports-count").textContent = `${activeReports.length} Active`;

  activeReports.forEach(r => {
    const confs = r.confirmations || [];
    const totalWeight = confs.length;
    let status = r.type === "danger" ? "Danger" : (totalWeight >= 3 ? "Verified Safe" : `${totalWeight} of 3 Confirmed`);
    let cls = r.type === "danger" ? "danger" : (totalWeight >= 3 ? "safe" : "pending");

    const marker = L.marker([r.lat, r.lng], { icon: makeIcon(r.type, totalWeight) }).addTo(markerLayer);
    marker.on("click", () => openZoneModal(r.id));

    const item = document.createElement("div");
    item.className = "report-item";
    item.onclick = () => { map.flyTo([r.lat, r.lng], 14); openZoneModal(r.id); };
    item.innerHTML = `<div class="report-top"><span style="font-weight:700; color:var(--text-hi);">${r.reportedByName}</span><span class="tag ${cls}">${status}</span></div>`;
    list.appendChild(item);
  });

  checkProximityAlerts();
}

function openZoneModal(id) {
  const r = state.reports.find(x => x.id === id);
  if(!r) return;
  const confs = r.confirmations || [];
  const totalWeight = confs.length;
  
  document.getElementById("zone-modal-title").textContent = r.type === "danger" ? "Danger Zone" : "Safe Zone";
  const btn = document.getElementById("zone-confirm-btn");
  const prog = document.getElementById("zone-modal-progress");
  
  let timerEl = document.getElementById("zone-modal-timer");
  if (!timerEl) {
    timerEl = document.createElement("div");
    timerEl.id = "zone-modal-timer";
    timerEl.style.cssText = "font-family: monospace; font-size: 2.8rem; color: var(--theme-glow); text-align: center; margin-bottom: 1rem; font-weight: 700; display: none;";
    prog.parentNode.insertBefore(timerEl, prog);
  }

  if (window.zoneTimer) clearInterval(window.zoneTimer);
  timerEl.style.display = "none";
  
  const updateTimerDisplay = () => {
    const now = Date.now();
    let exp = r.expiresAt;
    if (exp && typeof exp.toMillis === 'function') exp = exp.toMillis();
    else if (exp && exp.toDate) exp = exp.toDate().getTime();

    if (!exp) return;
    const diff = exp - now;
    
    if (diff <= 0) {
      timerEl.textContent = "00:00";
      clearInterval(window.zoneTimer);
      closeModal("zone-modal-overlay");
      renderReports();
    } else {
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  };
  
  if (r.type === "danger") {
    prog.textContent = "Immediate danger alert active.";
    btn.style.display = "none";
    
    timerEl.style.display = "block";
    updateTimerDisplay();
    window.zoneTimer = setInterval(updateTimerDisplay, 1000);
    
  } else {
    if (totalWeight >= 3) {
      prog.textContent = "Fully Verified Safe Zone";
      btn.style.display = "none";
      
      timerEl.style.display = "block";
      updateTimerDisplay();
      window.zoneTimer = setInterval(updateTimerDisplay, 1000);
      
    } else {
      prog.textContent = `3 confirmations are required. Currently ${totalWeight} of 3 are confirmed.`;
      btn.style.display = "block";
      
      if (!state.user) { 
        btn.disabled = true; btn.textContent = "Sign in to confirm"; 
      } else if (confs.includes(state.user.uid)) { 
        btn.disabled = true; btn.textContent = "You already confirmed this"; 
      } else { 
        btn.disabled = false; btn.textContent = "Confirm this safe zone"; 
      }
      btn.onclick = () => confirmSafeZone(id);
    }
  }
  
  openModal("zone-modal-overlay");
}

async function cleanupExpiredZones() {
  const now = Date.now();
  const expiredQuery = db.collection('reports').where('expiresAt', '<', now);
  try {
    const snapshot = await expiredQuery.get();
    if (!snapshot.empty) {
      const batch = db.batch();
      snapshot.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  } catch (error) { console.error("Cleanup failed:", error); }
}

setInterval(() => {
  if (state.reports && state.reports.length > 0) {
    renderReports();
  }
  if (fbReady) cleanupExpiredZones();
}, 15000);

if (fbReady) {
  db.collection("reports").orderBy("timestamp", "desc").limit(100).onSnapshot(
    snap => {
      state.reports = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderReports();
    },
    error => {
      console.warn("Firestore Rules note:", error.message);
    }
  );
}

});
