import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    userEmail: { 
      type: String, 
      required: true, 
      trim: true 
    },

    type: { 
      type: String, 
      required: true, 
      trim: true 
    },

    date: { 
      type: String, 
      required: true 
    },

    time: { 
      type: String, 
      required: true 
    },

    status: { 
      type: String, 
      enum: ["Pending", "Confirmed", "Cancelled", "Rescheduled"], 
      default: "Pending" 
    },
    
    previousDate: { type: String },
    previousTime: { type: String },
    notes: { type: String, trim: true }
  },
  { 
    timestamps: true 
  }
);

export default mongoose.model("Appointment", appointmentSchema);
