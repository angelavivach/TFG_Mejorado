#!/bin/sh
# Sube el proyecto a GitHub. Uso: sh subir-a-github.sh
cd "$(dirname "$0")" || exit 1
command -v git >/dev/null 2>&1 || { echo "Instala Git: https://git-scm.com/downloads"; exit 1; }
if [ ! -d .git ]; then
  git init -b main && git add . && git commit -m "TimeCP listo para Render"
fi
printf "Pega la URL de tu repositorio de GitHub (https://github.com/usuario/repo.git): "
read -r URL
git remote remove origin 2>/dev/null
git remote add origin "$URL"
git branch -M main
if git push -u origin main; then
  echo "Listo. Ahora ve a Render: New + > Blueprint > elige este repositorio."
else
  echo "Ha fallado la subida. Revisa la URL y que el repositorio de GitHub esté VACÍO."
fi
