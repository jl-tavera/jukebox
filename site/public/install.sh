#!/bin/sh
#
# Jukebox installer for macOS and Linux.
#
#   curl -fsSL https://jukebox-site.joseluis64tavera.workers.dev/install.sh | sh
#
# Places a single self-contained binary in a per-user directory and puts that
# directory on PATH. Nothing is compiled, nothing needs root, and nothing is
# installed system-wide.
#
# Environment:
#   JUKEBOX_VERSION      a tag to pin, such as v0.1.0. Defaults to the latest release.
#   JUKEBOX_INSTALL_DIR  where the binary goes. Defaults to $HOME/.local/bin.

set -eu

REPO="jl-tavera/jukebox"

# The line appended to a profile, and the marker that keeps a second run from
# appending it twice.
MARKER="# added by jukebox install.sh"

# Everything is wrapped in a function called on the last line, so that a download
# cut short cannot execute a half-read script. `sh` reads a stream as it arrives;
# without this, a connection dropping mid-file runs whatever prefix arrived, and
# the dangerous prefixes are the ones that have already resolved a path and not
# yet worked out what to put in it.
main() {
	os=$(uname -s)
	arch=$(uname -m)

	# Named rather than guessed. A platform this release does not build for is
	# told so here, where the message can say which ones exist -- not by
	# downloading a binary that meets the kernel and fails.
	case "$os" in
		Darwin) os=darwin ;;
		Linux) os=linux ;;
		*) die "Jukebox has no build for $os. macOS and Linux are what this release ships." ;;
	esac

	case "$arch" in
		x86_64 | amd64) arch=x64 ;;
		arm64 | aarch64) arch=arm64 ;;
		*) die "Jukebox has no build for $arch. x86_64 and arm64 are what this release ships." ;;
	esac

	asset="jukebox-$os-$arch"

	# GitHub's own redirect resolves the newest release, so this costs no API
	# call and meets no rate limit -- which matters for a script whose whole
	# audience runs it unauthenticated.
	if [ -n "${JUKEBOX_VERSION-}" ]; then
		base="https://github.com/$REPO/releases/download/$JUKEBOX_VERSION"
	else
		base="https://github.com/$REPO/releases/latest/download"
	fi

	dir="${JUKEBOX_INSTALL_DIR-$HOME/.local/bin}"

	need curl
	need install

	work=$(mktemp -d 2>/dev/null || mktemp -d -t jukebox)
	# Removed however this exits, the failure paths included, so a refused
	# checksum does not leave an unverified binary in /tmp for somebody to
	# find and run.
	trap 'rm -rf "$work"' EXIT INT TERM

	say "downloading $asset"
	fetch "$base/$asset" "$work/$asset"
	fetch "$base/SHA256SUMS" "$work/SHA256SUMS"
	verify "$work" "$asset"

	mkdir -p "$dir"
	# `install` rather than `cp` then `chmod`: it sets the mode as it writes,
	# so there is no instant where the file exists and is not yet executable,
	# and it replaces the target by unlinking rather than writing through it
	# -- which is what makes reinstalling over a copy you are running safe.
	install -m 755 "$work/$asset" "$dir/jukebox"

	# Run once, to prove the thing that was just installed executes on this
	# machine. A binary for the wrong architecture is otherwise discovered by
	# the user, later, as an error from their kernel.
	#
	# What it printed is deliberately thrown away rather than reported. Output
	# into a command substitution is not a terminal, so `--version` answers in
	# JSON -- and ADR-0005 makes that shape unstable before 1.0. An installer
	# parsing it would be the exact reader that ADR warns off.
	# stdin is redirected because this whole script is usually being read off a
	# pipe from curl. A child inheriting that pipe could consume the rest of the
	# script out from under the shell still reading it -- the same hazard the
	# main() wrapper exists for, met from the other direction.
	"$dir/jukebox" --version >/dev/null 2>&1 </dev/null ||
		die "the binary was installed to $dir/jukebox but does not run on this machine."

	say "installed to $dir/jukebox"
	put_on_path "$dir"
}

say() {
	printf 'jukebox: %s\n' "$1"
}

die() {
	printf 'jukebox: %s\n' "$1" >&2
	exit 1
}

need() {
	command -v "$1" >/dev/null 2>&1 || die "this installer needs $1, and it is not on PATH."
}

fetch() {
	# --fail so an HTML error page is an error rather than a file. Without it a
	# 404 body is written to disk and fails much later, as a checksum mismatch
	# that describes the wrong problem.
	curl -fsSL --proto '=https' --tlsv1.2 -o "$2" "$1" ||
		die "could not download $1"
}

# The transport is already HTTPS from GitHub, so this is not defending against a
# hostile network. It defends against a download that ended early: a truncated
# binary otherwise reaches the user as something incomprehensible from their
# kernel, minutes after this script said it was done.
verify() {
	verify_dir=$1
	verify_asset=$2

	# Linux ships sha256sum, macOS ships shasum. One of the two is always
	# there, and both read sha256sum's own format without being told anything.
	if command -v sha256sum >/dev/null 2>&1; then
		checker="sha256sum -c"
	elif command -v shasum >/dev/null 2>&1; then
		checker="shasum -a 256 -c"
	else
		die "neither sha256sum nor shasum is on PATH, so the download cannot be verified."
	fi

	# Cut down to the one line naming this asset, rather than handing over the
	# whole file with an --ignore-missing flag: GNU coreutils has that flag and
	# the shasum macOS ships does not, so a checker chosen at runtime cannot
	# rely on it. One line also means the four absent binaries cannot be read
	# as four failures.
	grep " $verify_asset\$" "$verify_dir/SHA256SUMS" >"$verify_dir/wanted" ||
		die "SHA256SUMS does not mention $verify_asset."

	# Run from the directory the file is in, because SHA256SUMS names bare
	# filenames -- which is what keeps it verifiable from anywhere. Exit status
	# rather than --status, for the same portability reason as above.
	(cd "$verify_dir" && $checker wanted) >/dev/null 2>&1 ||
		die "$verify_asset does not match its published checksum. Nothing was installed."
}

put_on_path() {
	path_dir=$1

	case ":$PATH:" in
		*":$path_dir:"*)
			say "$path_dir is already on your PATH."
			return
			;;
	esac

	profile=$(profile_for)
	if [ -z "$profile" ]; then
		say "add $path_dir to your PATH to run jukebox by name."
		return
	fi

	# Idempotent by marker rather than by exact line, so that editing the
	# export in a later release still finds the old one and does not stack a
	# second copy on top of it.
	if [ -f "$profile" ] && grep -qF "$MARKER" "$profile"; then
		say "$profile already puts $path_dir on your PATH."
	else
		mkdir -p "$(dirname "$profile")"
		printf '\n%s\n%s\n' "$MARKER" "$(path_line "$profile" "$path_dir")" >>"$profile"
		say "added $path_dir to your PATH in $profile"
	fi

	say "open a new shell, or run: export PATH=\"$path_dir:\$PATH\""
}

# Which file the user's own shell reads. Writing to the wrong one is
# indistinguishable from doing nothing, and the user finds out one shell later.
profile_for() {
	case "$(basename "${SHELL-}")" in
		zsh) printf '%s' "${ZDOTDIR-$HOME}/.zshrc" ;;
		fish) printf '%s' "${XDG_CONFIG_HOME-$HOME/.config}/fish/config.fish" ;;
		bash)
			# macOS's Terminal starts login shells, which read .bash_profile
			# and never .bashrc. Linux terminals do the opposite.
			if [ "$(uname -s)" = Darwin ]; then
				printf '%s' "$HOME/.bash_profile"
			else
				printf '%s' "$HOME/.bashrc"
			fi
			;;
		sh | dash | ksh) printf '%s' "$HOME/.profile" ;;
		# An unrecognised shell is told rather than guessed at. A PATH line in
		# the wrong syntax is a shell that prints an error on every start.
		*) printf '' ;;
	esac
}

path_line() {
	case "$1" in
		*/fish/config.fish) printf 'fish_add_path %s' "$2" ;;
		*) printf 'export PATH="%s:$PATH"' "$2" ;;
	esac
}

main
