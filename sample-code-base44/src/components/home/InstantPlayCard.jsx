import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const TIMES = ["Now", "1 hour", "2 hours"];

export default function InstantPlayCard() {
  const navigate = useNavigate();
  const [time, setTime] = useState("Now");

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 p-5 shadow-xl shadow-primary/30"
    >
      <div className="absolute top-0 right-0 w-36 h-36 bg-white/5 rounded-full -translate-y-10 translate-x-10" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-10 -translate-x-6" />
      <div className="relative">
        <p className="text-primary-foreground/80 text-sm font-medium mb-0.5">Ready to play Padel?</p>
        <h2 className="font-heading font-bold text-2xl text-primary-foreground mb-1">Find players instantly</h2>
        <p className="text-primary-foreground/70 text-sm mb-4">Get matched with nearby Padel players now</p>

        <div className="flex gap-2 mb-4">
          {TIMES.map((t) => (
            <button
              key={t}
              onClick={() => setTime(t)}
              className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                time === t ? "bg-white/30 text-primary-foreground" : "bg-white/10 text-primary-foreground/70"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <Button
          onClick={() => navigate("/instant-play")}
          className="w-full h-12 rounded-2xl font-heading font-bold text-base bg-white text-primary hover:bg-white/90 shadow-lg"
        >
          <Zap className="w-5 h-5 mr-2 fill-primary" /> Play Now
        </Button>
      </div>
    </motion.div>
  );
}