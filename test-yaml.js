import YAML from "yaml";

const data = {
  workflow: {
    auto_cancel: {
      on_new_commit: "interruptible",
    },
  },
};

// Default stringify
console.log("=== Default ===");
console.log(YAML.stringify(data));

// With lineWidth option
console.log("\n=== With lineWidth: 0 (no line breaking) ===");
console.log(YAML.stringify(data, { lineWidth: 0 }));

// With other options
console.log("\n=== With compact options ===");
console.log(
  YAML.stringify(data, {
    lineWidth: 0,
    minContentWidth: 0,
    singleQuote: false,
  }),
);
