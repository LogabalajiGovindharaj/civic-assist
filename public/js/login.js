document.getElementById("tokenNo").textContent = String(Math.floor(100 + Math.random() * 900));

let mode = "login"; // or "signup"

const form = document.getElementById("authForm");
const errorText = document.getElementById("errorText");
const formTitle = document.getElementById("formTitle");
const submitBtn = document.getElementById("submitBtn");
const toggleText = document.getElementById("toggleText");
const toggleLink = document.getElementById("toggleLink");
const usernameLabel = document.getElementById("usernameLabel");
const mobileField = document.getElementById("mobileField");
const mobileInput = document.getElementById("mobile");

usernameLabel.textContent = "Username or mobile number";

toggleLink.addEventListener("click", (e) => {
  e.preventDefault();
  errorText.textContent = "";
  if (mode === "login") {
    mode = "signup";
    formTitle.textContent = "Create account";
    submitBtn.textContent = "Create account";
    toggleText.textContent = "Already registered?";
    toggleLink.textContent = "Sign in instead";
    usernameLabel.textContent = "Username";
    mobileField.style.display = "flex";
    mobileInput.required = true;
  } else {
    mode = "login";
    formTitle.textContent = "Sign in";
    submitBtn.textContent = "Sign in";
    toggleText.textContent = "New here?";
    toggleLink.textContent = "Create an account";
    usernameLabel.textContent = "Username or mobile number";
    mobileField.style.display = "none";
    mobileInput.required = false;
  }
});

// If already logged in, skip straight to the dashboard.
fetch("/api/auth/me").then(r => r.json()).then(d => {
  if (d.user) window.location.href = "/dashboard.html";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorText.textContent = "";
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
  const body =
    mode === "login"
      ? { identifier: username, password }
      : { username, mobile: mobileInput.value.trim(), password };

  submitBtn.disabled = true;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      errorText.textContent = data.error || "Something went wrong.";
      submitBtn.disabled = false;
      return;
    }
    window.location.href = "/dashboard.html";
  } catch (err) {
    errorText.textContent = "Could not reach the server.";
    submitBtn.disabled = false;
  }
});
