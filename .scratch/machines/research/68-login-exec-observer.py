"""Guest-only ptrace observer. Never outputs argv, URLs, or environment values."""
import ctypes
import errno
import json
import os
import select
import signal
import sys
import threading

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


stdout_read, stdout_write = os.pipe()
pid = os.fork()
if pid == 0:
    os.close(stdout_read)
    os.dup2(stdout_write, 1)
    os.close(stdout_write)
    trace(0, 0)  # PTRACE_TRACEME
    os.kill(os.getpid(), signal.SIGSTOP)
    os.execv(sys.argv[1], sys.argv[1:])

os.close(stdout_write)
release_stdout = threading.Event()


def forward_stdout():
    # The CLI prints the manual challenge before calling its opener. Retain only its
    # small initial stdout in memory until the true exec is witnessed, so the host
    # can still cancel immediately at the first delivered/recognized challenge.
    pending = bytearray()
    while True:
        if release_stdout.is_set() and pending:
            while pending:
                written = os.write(1, pending)
                del pending[:written]
        readable, _, _ = select.select([stdout_read], [], [], 0.01)
        if not readable:
            continue
        chunk = os.read(stdout_read, 65536)
        if not chunk:
            return
        pending.extend(chunk)
        if len(pending) > 262144:
            emit({"event": "observer-output-bound"})
            os.kill(pid, signal.SIGKILL)
            return


threading.Thread(target=forward_stdout, daemon=True).start()

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
        if executable == os.path.realpath('/bin/true') and browser == b"/bin/true":
            release_stdout.set()
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
