import React, { useState, useEffect, useCallback } from "react";

// Icons (Using simple SVGs for zero dependencies)
const CalcIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <line x1="8" y1="6" x2="16" y2="6" />
    <line x1="16" y1="14" x2="16" y2="18" />
    <path d="M16 10h.01" />
    <path d="M12 10h.01" />
    <path d="M8 10h.01" />
    <path d="M12 14h.01" />
    <path d="M8 14h.01" />
    <path d="M12 18h.01" />
    <path d="M8 18h.01" />
  </svg>
);

const CloseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function NeumorphicCalculator() {
  const [isOpen, setIsOpen] = useState(false);
  const [display, setDisplay] = useState("0"); // Large text
  const [history, setHistory] = useState(""); // Small top text
  const [activeKey, setActiveKey] = useState(null); // For visual keyboard feedback
  const [resetNext, setResetNext] = useState(false); // Flag to reset on next number

  // --- Logic ---

  const handleInput = useCallback((val) => {
    if (val === "C") {
      setDisplay("0");
      setHistory("");
      return;
    }

    if (val === "=" || val === "Enter") {
      try {
        // Evaluate logic
        const sanitized = (history + display).replace(/×/g, "*").replace(/÷/g, "/");
        // Safe evaluation
        const result = Function(`"use strict"; return (${sanitized})`)();

        setHistory(history + display + " =");
        setDisplay(String(result));
        setResetNext(true);
      } catch (e) {
        setDisplay("Error");
        setResetNext(true);
      }
      return;
    }

    if (val === "+/-") {
      setDisplay((prev) => (prev.startsWith("-") ? prev.slice(1) : "-" + prev));
      return;
    }

    if (val === "%") {
       setDisplay((prev) => String(parseFloat(prev) / 100));
       return;
    }

    // Operators
    if (["+", "-", "×", "÷", "/"].includes(val)) {
      const operator = val === "/" ? "÷" : val === "*" ? "×" : val;
      setHistory(display + " " + operator + " ");
      setResetNext(true);
      return;
    }

    // Numbers & Decimals
    setDisplay((prev) => {
      if (resetNext) {
        setResetNext(false);
        return val;
      }
      if (prev === "0" && val !== ".") return val;
      if (val === "." && prev.includes(".")) return prev;
      return prev + val;
    });
  }, [display, history, resetNext]);

  // --- Keyboard Listener ---

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      let key = e.key;

      // Mapping keyboard keys to calculator values
      if (key === "Enter") key = "=";
      if (key === "Escape") setIsOpen(false);
      if (key === "Backspace") {
          setDisplay(prev => prev.length > 1 ? prev.slice(0, -1) : "0");
          return;
      }
      if (key === "*") key = "×";
      if (key === "/") key = "÷";
      if (key === "c" || key === "C") key = "C";

      // Valid keys list
      const validKeys = ["1","2","3","4","5","6","7","8","9","0",".","+","-","=","×","÷", "C", "%"];

      if (validKeys.includes(key)) {
        e.preventDefault();
        // Visual feedback trigger
        setActiveKey(key);
        setTimeout(() => setActiveKey(null), 150);

        // Logical trigger
        handleInput(key);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleInput]);

  // --- Styles (Neumorphism) ---

  const colors = {
    bg: "#e0e5ec",
    text: "#4a5568",
    shadowLight: "#ffffff",
    shadowDark: "#a3b1c6",
    accent: "#ff9f43" // Optional accent color if needed, sticking to mono for now
  };

  const styles = {
    wrapper: {
      position: "fixed",
      top: "calc(30px + 2rem)",
      right: "20px",
      zIndex: 10000,
      fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    },
    toggleButton: {
      width: "60px",
      height: "60px",
      borderRadius: "50%",
      border: "none",
      background: colors.bg,
      color: colors.text,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      // Neumorphic Shadow (convex)
      boxShadow: `4px 4px 9px ${colors.shadowDark}, -4px -4px 9px ${colors.shadowLight}`,

      transition: "all 0.2s ease",
      outline: "none",
    },
    container: {
      position: "absolute",
      top: "80px",
      right: "0",
      width: "320px",
      background: colors.bg,
      borderRadius: "30px",
      padding: "25px",
      // Deep Neumorphic Shadow for the container
      boxShadow: `6px 6px 12px ${colors.shadowDark}, -6px -6px 12px ${colors.shadowLight}`,
    },
    screen: {
      width: "100%",
      minHeight: "100px",
      maxHeight: "120px",
      marginBottom: "25px",
      borderRadius: "20px",
      background: colors.bg,
      boxShadow: `inset 6px 6px 12px ${colors.shadowDark}, inset -6px -6px 12px ${colors.shadowLight}`,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "flex-end",
      padding: "10px 20px",
      boxSizing: "border-box",
      overflow: "hidden",            // 🔥 Prevent overflow
    },
    historyText: {
      fontSize: "14px",
      color: "#8899a6",
      marginBottom: "5px",
      height: "20px",
    },
    mainText: {
      fontWeight: "600",
      color: colors.text,
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontSize: display.length > 10 ? "24px" : "36px", // 🔥 Automatically shrink
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: "15px",
    },
    button: (keyVal) => ({
      height: "55px",
      width: "55px",
      borderRadius: "12px",
      border: "none",
      fontSize: "20px",
      fontWeight: "500",
      color: colors.text,
      background: colors.bg,
      cursor: "pointer",
      outline: "none",
      transition: "all 0.1s ease",
      // Toggle shadow based on if it's being pressed (by mouse or keyboard)
      boxShadow: activeKey === keyVal
        ? `inset 4px 4px 8px ${colors.shadowDark}, inset -4px -4px 8px ${colors.shadowLight}`
        : `6px 6px 10px ${colors.shadowDark}, -6px -6px 10px ${colors.shadowLight}`,
       // Make the text slightly move when pressed
       transform: activeKey === keyVal ? "scale(0.95)" : "scale(1)",
    }),
  };

  const buttons = [
    "C", "÷", "%", "×",
    "7", "8", "9", "-",
    "4", "5", "6", "+",
    "1", "2", "3", "=", // Note: Using standard layout. The Image had = at bottom right
    "0", ".", "+/-"
  ];

  // Helper to determine if button needs specific sizing (like 0 or =)
  const getButtonStyle = (btn) => {
    let base = styles.button(btn);
    // Custom tweaks for layout if you want to match the image exactly:
    if (btn === "=") {
        // Make equals tall or wide? Let's make it vertical to match the style often seen,
        // OR keep it standard grid. Let's do a standard grid but the image has 0 wide.
        // Let's stick to simple 4x5 grid for reliability.
        base.gridRow = "span 2"; // Example if we wanted vertical equals
        base.height = "125px";
    }
    return base;
  };

  // Re-organizing buttons to match a standard numpad better with Neumorphism
  const layout = [
    ["C", "÷", "%", "×"],
    ["7", "8", "9", "-"],
    ["4", "5", "6", "+"],
    ["1", "2", "3", "="], // We will make = span 2 rows vertically
    ["0", ".", "+/-"]
  ];

  return (
    <div style={styles.wrapper}>
      {/* Round Toggle Button */}
      <button onClick={() => setIsOpen(!isOpen)} style={styles.toggleButton} title="Toggle Calculator">
        {isOpen ? <CloseIcon /> : <CalcIcon />}
      </button>

      {/* Calculator Body */}
      {isOpen && (
        <div style={styles.container}>
          {/* Screen */}
          <div style={styles.screen}>
            <div style={styles.historyText}>{history}</div>
            <div style={styles.mainText}>{display}</div>
          </div>

          {/* Keypad */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "15px", gridTemplateRows: "repeat(5, 55px)" }}>
             {/* Row 1 */}
             <button style={styles.button("C")} onClick={() => handleInput("C")}>C</button>
             <button style={styles.button("÷")} onClick={() => handleInput("÷")}>÷</button>
             <button style={styles.button("%")} onClick={() => handleInput("%")}>%</button>
             <button style={styles.button("×")} onClick={() => handleInput("×")}>×</button>

             {/* Row 2 */}
             <button style={styles.button("7")} onClick={() => handleInput("7")}>7</button>
             <button style={styles.button("8")} onClick={() => handleInput("8")}>8</button>
             <button style={styles.button("9")} onClick={() => handleInput("9")}>9</button>
             <button style={styles.button("-")} onClick={() => handleInput("-")}>-</button>

             {/* Row 3 */}
             <button style={styles.button("4")} onClick={() => handleInput("4")}>4</button>
             <button style={styles.button("5")} onClick={() => handleInput("5")}>5</button>
             <button style={styles.button("6")} onClick={() => handleInput("6")}>6</button>
             <button style={styles.button("+")} onClick={() => handleInput("+")}>+</button>

             {/* Row 4 */}
             <button style={styles.button("1")} onClick={() => handleInput("1")}>1</button>
             <button style={styles.button("2")} onClick={() => handleInput("2")}>2</button>
             <button style={styles.button("3")} onClick={() => handleInput("3")}>3</button>

             {/* Tall Equals Button (Spans 2 rows) */}
             <button
                style={{ ...styles.button("="), gridColumn: "4", gridRow: "4 / span 2", height: "100%" }}
                onClick={() => handleInput("=")}
             >=</button>

             {/* Row 5 */}
             <button style={styles.button("0")} onClick={() => handleInput("0")}>0</button>
             <button style={styles.button(".")} onClick={() => handleInput(".")}>.</button>
             <button style={styles.button("+/-")} onClick={() => handleInput("+/-")}>+/-</button>
          </div>
        </div>
      )}
    </div>
  );
}