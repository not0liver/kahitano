document.addEventListener("DOMContentLoaded", async () => {
  await loadAppointments();
});

async function loadAppointments() {
  try {
    const res = await fetch("/api/appointments");
    if (!res.ok) throw new Error("Failed to fetch appointments");
    const appointments = await res.json();

    const pending = appointments.filter(a => a.status === "Pending");
    const others = appointments.filter(a => a.status !== "Pending");

    renderAppointments("myAppointments", pending, true);  
    renderAppointments("rescheduleCancel", others, false); 
  } catch (err) {
    console.error("Error loading appointments:", err);
  }
}


function renderAppointments(containerId, list, showCancel) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `<p>No appointments found.</p>`;
    return;
  }

  container.innerHTML = list.map(a => `
    <div class="appointment-card">
      <p><strong>Type:</strong> ${a.type}</p>
      <p><strong>Date:</strong> ${a.date}</p>
      <p><strong>Time:</strong> ${a.time}</p>
      <p><strong>Status:</strong> ${a.status}</p>
      ${showCancel ? `<button onclick="cancelAppointment('${a._id}')">Cancel</button>` : ""}
    </div>
  `).join("");
}


async function cancelAppointment(id) {
  if (!confirm("Are you sure you want to cancel this appointment?")) return;

  try {
    const res = await fetch(`/api/appointments/${id}/cancel`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) throw new Error("Failed to cancel appointment");

    alert("Appointment canceled successfully!");
    await loadAppointments(); 
  } catch (err) {
    console.error(err);
    alert("Error canceling appointment.");
  }
}
