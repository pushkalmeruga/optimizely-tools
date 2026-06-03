module.exports = function optimizelyCssOutputLoader(source) {
  const options = this.getOptions();
  const filename = options.filename || "optimizely.css";

  this.emitFile(filename, source);
  return "";
};
