# Source this file. Sets up the SUMO paths from the local venv.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
export PATH="$HERE/.venv/bin:$PATH"
export SUMO_HOME="$($HERE/.venv/bin/python -c 'import sumo,os;print(os.path.dirname(sumo.__file__))')"
export PYTHONPATH="$SUMO_HOME/tools:${PYTHONPATH:-}"
