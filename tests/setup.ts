for (const name of Object.keys(process.env).filter((key) => key.startsWith("GIT_"))) {
  Reflect.deleteProperty(process.env, name);
}
