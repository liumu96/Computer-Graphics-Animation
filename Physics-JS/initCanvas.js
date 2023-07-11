// canvas setup
const canvas = document.getElementById("canvas");
const context = canvas.getContext("2d");
canvas.width = window.innerWidth - 20;
canvas.height = window.innerHeight - 80;

const simMinWidth = 5.0;
const cScale = Math.min(canvas.width, canvas.height) / simMinWidth;
const simWidth = canvas.width / cScale;
const simHeight = canvas.height / cScale;

function cX(pos) {
  return pos.x * cScale;
}

function cY(pos) {
  return canvas.height - pos.y * cScale;
}
