"""Guest-only ptrace observer. Never outputs argv, URLs, or environment values."""
import ctypes
import errno
import json
import os
import signal
import sys

libc = ctypes.CDLL(None, use_errno=True)
libc.ptrace.argtypes = [ctypes.c_ulong, ctypes.c_ulong, ctypes.c_void_p, ctypes.c_void_p]
libc.ptrace.restype = ctypes.c_long


def trace(request, pid, data=0):
    ctypes.set_errno(0)
    result = libc.ptrace(request, pid, None, ctypes.c_void_p(data))
    if result == -1 and ctypes.get_errno():
        raise OSError(ctypes.get_errno(), "ptrace failed")
    return result


def emit(value):
    print("BLOBOT_RESEARCH68 " + json.dumps(value), file=sys.stderr, flush=True)


pid = os.fork()
if pid == 0:
    trace(0, 0)  # PTRACE_TRACEME
    os.kill(os.getpid(), signal.SIGSTOP)
    os.execv(sys.argv[1], sys.argv[1:])

_, status = os.waitpid(pid, 0)
if not os.WIFSTOPPED(status):
    raise RuntimeError("child did not stop")
# Fork, vfork, clone, exec; kill tracees if this observer dies during cancellation.
trace(0x4200, pid, 2 | 4 | 8 | 16 | 0x100000)
trace(7, pid)
main_exit = 1
opener_names = {"open", "xdg-open", "sensible-browser", "x-www-browser", "www-browser",
                "firefox", "chromium", "chromium-browser", "google-chrome", "gio",
                "gdbus", "dbus-send", "wslview", "explorer.exe", "powershell.exe"}
while True:
    try:
        tid, status = os.waitpid(-1, 0x40000000)  # __WALL: trace all threads.
    except ChildProcessError:
        break
    if os.WIFEXITED(status) or os.WIFSIGNALED(status):
        if tid == pid:
            main_exit = os.WEXITSTATUS(status) if os.WIFEXITED(status) else 128 + os.WTERMSIG(status)
        continue
    if not os.WIFSTOPPED(status):
        continue
    event, stop_signal = status >> 16, os.WSTOPSIG(status)
    if event == 4:  # Stop after successful exec, before the program runs.
        executable = os.readlink(f"/proc/{tid}/exe")
        # Only inspect the first two argv slots to recognize interpreter/opener paths.
        # Values stay in memory and no argument is included in emit().
        args = open(f"/proc/{tid}/cmdline", "rb").read().split(b"\0")
        suspicious = os.path.basename(executable) in opener_names or any(
            os.path.basename(item.decode("utf8", "replace")) in opener_names for item in args[:2]
        )
        browser = next((item[8:] for item in open(f"/proc/{tid}/environ", "rb").read().split(b"\0")
                        if item.startswith(b"BROWSER=")), None)
        emit({"event": "exec", "executable": executable, "browserPresent": browser is not None,
              "browserIsTrue": browser == b"/bin/true", "blockedUnexpectedOpener": suspicious})
        if suspicious:
            os.kill(tid, signal.SIGKILL)
            continue
    delivered = 0 if event or stop_signal in (signal.SIGTRAP, signal.SIGSTOP) else stop_signal
    try:
        trace(7, tid, delivered)
    except OSError as error:
        if error.errno != errno.ESRCH:
            raise
sys.exit(main_exit)
