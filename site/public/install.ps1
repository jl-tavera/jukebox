<#
	Jukebox installer for Windows.

	    irm https://jukebox-site.joseluis64tavera.workers.dev/install.ps1 | iex

	Places a single self-contained binary in a per-user directory and puts that
	directory on PATH. Nothing is compiled, nothing needs an administrator, and
	nothing is installed machine-wide.

	Environment:
	    JUKEBOX_VERSION      a tag to pin, such as v0.1.0. Defaults to the latest release.
	    JUKEBOX_INSTALL_DIR  where the binary goes. Defaults to %LOCALAPPDATA%\Programs\Jukebox.

	No param() block, deliberately: this script is meant to be read off the wire
	and piped into `iex`, which has no way to pass arguments to one. Settings are
	environment variables so that the documented invocation is the whole
	interface, and they are spelled the same as install.sh's.
#>

$ErrorActionPreference = 'Stop'

# Invoke-WebRequest renders a progress bar per chunk on Windows PowerShell 5.1,
# which costs far more than the download itself on a binary this size.
$ProgressPreference = 'SilentlyContinue'

$Repo = 'jl-tavera/jukebox'

function Say([string] $Message) { Write-Host "jukebox: $Message" }

function Die([string] $Message) { throw "jukebox: $Message" }

# The one asset this release builds for Windows. #38 ships Windows on x64 only,
# so an arm64 machine is told which builds exist rather than handed an x64 binary
# to emulate -- Windows would run it under emulation and it would be slow in a
# way nothing here could explain.
function Get-Asset {
	# The OS's architecture, not the host process's. PROCESSOR_ARCHITECTURE
	# reports `x86` to a 32-bit PowerShell running on 64-bit Windows -- which is
	# an ordinary way to arrive here, and would turn a supported machine away
	# with "no build for x86". Is64BitOperatingSystem answers the question
	# actually being asked.
	if (-not [Environment]::Is64BitOperatingSystem) {
		Die "Jukebox has no build for 32-bit Windows. Windows on x64 is what this release ships."
	}

	# On 64-bit Windows the remaining question is x64 against arm64, and for that
	# the process variable is unreliable in the other direction too: a 32-bit
	# host has its real answer in PROCESSOR_ARCHITEW6432.
	$arch = $env:PROCESSOR_ARCHITEW6432
	if ([string]::IsNullOrEmpty($arch)) { $arch = $env:PROCESSOR_ARCHITECTURE }

	if ($arch -eq 'ARM64') {
		Die 'Jukebox has no build for Windows on arm64. Windows on x64 is what this release ships.'
	}

	return 'jukebox-windows-x64.exe'
}

function Get-DownloadBase {
	# GitHub's own redirect resolves the newest release, so this costs no API
	# call and meets no rate limit.
	if ([string]::IsNullOrWhiteSpace($env:JUKEBOX_VERSION)) {
		return "https://github.com/$Repo/releases/latest/download"
	}

	return "https://github.com/$Repo/releases/download/$($env:JUKEBOX_VERSION)"
}

function Get-File([string] $Url, [string] $Path) {
	try {
		Invoke-WebRequest -Uri $Url -OutFile $Path -UseBasicParsing
	} catch {
		Die "could not download $Url`n  $($_.Exception.Message)"
	}
}

<#
	The transport is already HTTPS from GitHub, so this is not defending against
	a hostile network. It defends against a download that ended early: a
	truncated binary otherwise reaches the user as an error from Windows itself,
	minutes after this script said it was done.
#>
function Test-Checksum([string] $File, [string] $Sums, [string] $Asset) {
	$line = Get-Content -LiteralPath $Sums |
		Where-Object { $_ -match "\s$([regex]::Escape($Asset))$" } |
		Select-Object -First 1

	if (-not $line) { Die "SHA256SUMS does not mention $Asset." }

	$want = ($line -split '\s+')[0]
	$got = (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash

	if ($got -ne $want.ToUpperInvariant()) {
		Die "$Asset does not match its published checksum. Nothing was installed."
	}
}

<#
	Put a directory on the user's PATH, and do it without destroying the rest of
	it.

	`[Environment]::GetEnvironmentVariable('Path', 'User')` EXPANDS environment
	variables on the way out. Writing that value back turns somebody's
	`%USERPROFILE%\bin` into a frozen absolute path, and the damage only shows up
	when they move their profile or a variable they were relying on changes. So
	the raw value is read from the registry with expansion switched off, and it
	is written back under the value kind it already had -- REG_EXPAND_SZ for
	almost everyone, and REG_SZ for the few whose PATH holds no variables.

	This is the only thing in this installer that can damage something the user
	already had, which is why it reads before it writes and appends rather than
	assembling a new value.
#>
function Add-ToUserPath([string] $Directory) {
	$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
	if (-not $key) { Die 'could not open HKCU\Environment to update your PATH.' }

	try {
		# A profile that has never had a user PATH has no value to read, and
		# GetValueKind throws rather than returning anything for it.
		$existing = $key.GetValueNames() -contains 'Path'
		if ($existing) {
			$kind = $key.GetValueKind('Path')
			$raw = [string] $key.GetValue(
				'Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
		} else {
			$kind = [Microsoft.Win32.RegistryValueKind]::ExpandString
			$raw = ''
		}

		# Compared against both the raw entries and their expansions, because
		# the directory may already be there spelled as %LOCALAPPDATA%\... --
		# and appending a second, absolute copy of a path already present is
		# how a PATH grows a duplicate on every reinstall.
		$entries = $raw -split ';' | Where-Object { $_ -ne '' }
		$already = $entries | Where-Object {
			$_.TrimEnd('\') -eq $Directory.TrimEnd('\') -or
			[Environment]::ExpandEnvironmentVariables($_).TrimEnd('\') -eq $Directory.TrimEnd('\')
		}

		if ($already) {
			Say "$Directory is already on your PATH."
		} else {
			$updated = (@($entries) + $Directory) -join ';'
			$key.SetValue('Path', $updated, $kind)
			Say "added $Directory to your PATH."
		}
	} finally {
		$key.Dispose()
	}

	# A shell started from the Start menu inherits explorer.exe's cached copy of
	# the environment, not the registry. Without this broadcast the new PATH is
	# invisible to every "fresh shell" until the next sign-out -- which is
	# exactly the thing a person checks first after installing.
	Publish-EnvironmentChange

	# And this shell, which has its own copy already, so the person who just ran
	# the installer can run `jukebox` without opening anything.
	$env:Path = "$env:Path;$Directory"
}

$SendMessageTimeoutSignature = @'
[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
public static extern IntPtr SendMessageTimeout(
    IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam,
    uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
'@

function Publish-EnvironmentChange {
	try {
		if (-not ('Jukebox.Native' -as [type])) {
			Add-Type -Namespace Jukebox -Name Native -MemberDefinition $SendMessageTimeoutSignature
		}

		$HWND_BROADCAST = [IntPtr] 0xffff
		$WM_SETTINGCHANGE = 0x1A
		$SMTO_ABORTIFHUNG = 0x2
		$answer = [UIntPtr]::Zero

		[void] [Jukebox.Native]::SendMessageTimeout(
			$HWND_BROADCAST, $WM_SETTINGCHANGE, [UIntPtr]::Zero, 'Environment',
			$SMTO_ABORTIFHUNG, 5000, [ref] $answer)
	} catch {
		# The PATH is written either way; only the notification failed. Worth a
		# sentence rather than an abort, because signing out fixes it and
		# failing the install here would not.
		Say 'could not notify running programs of the PATH change; sign out and back in if a new terminal cannot find jukebox.'
	}
}

function Install-Jukebox {
	# GitHub has required TLS 1.2 for years and Windows PowerShell 5.1 still
	# defaults to a set that may not include it, which surfaces as a connection
	# closed with no explanation.
	[Net.ServicePointManager]::SecurityProtocol =
		[Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

	$asset = Get-Asset
	$base = Get-DownloadBase

	$dir = $env:JUKEBOX_INSTALL_DIR
	if ([string]::IsNullOrWhiteSpace($dir)) {
		# Programs\, not %LOCALAPPDATA%\Jukebox: that folder is already the
		# CLI's data directory, where the Mirror and the cached discovery
		# document live. Those are rebuildable and this is not, and the code
		# went out of its way to keep the two lifetimes apart -- see
		# cli/src/paths.ts. Programs\ is also Windows' own convention for a
		# per-user install.
		$dir = Join-Path $env:LOCALAPPDATA 'Programs\Jukebox'
	}

	$work = Join-Path ([IO.Path]::GetTempPath()) "jukebox-$([guid]::NewGuid().ToString('N'))"
	New-Item -ItemType Directory -Path $work -Force | Out-Null

	try {
		Say "downloading $asset"
		$downloaded = Join-Path $work $asset
		$sums = Join-Path $work 'SHA256SUMS'
		Get-File "$base/$asset" $downloaded
		Get-File "$base/SHA256SUMS" $sums

		Test-Checksum $downloaded $sums $asset

		New-Item -ItemType Directory -Path $dir -Force | Out-Null
		$exe = Join-Path $dir 'jukebox.exe'

		try {
			Move-Item -LiteralPath $downloaded -Destination $exe -Force
		} catch {
			# Windows will not let a running image be replaced, and this is the
			# ordinary way to meet that: reinstalling while a jukebox command is
			# open in another window.
			#
			# Caught broadly and then tested, rather than with `catch
			# [IO.IOException]`. $ErrorActionPreference is Stop, which escalates a
			# cmdlet's non-terminating error by wrapping it -- so the typed catch
			# matches nothing and the person meets the raw Move-Item text instead
			# of the one sentence that tells them what to do. The wrapper keeps
			# the original on InnerException.
			$cause = $_.Exception
			while ($cause -and -not ($cause -is [IO.IOException])) { $cause = $cause.InnerException }

			if ($cause) { Die "$exe is in use. Close any running jukebox and try again." }
			throw
		}

		# Run once, to prove what was just installed executes on this machine.
		#
		# What it printed is thrown away rather than reported: output into a
		# pipeline is not a terminal, so `--version` answers in JSON, and
		# ADR-0005 makes that shape unstable before 1.0. An installer parsing it
		# would be the exact reader that ADR warns off.
		& $exe --version | Out-Null
		if ($LASTEXITCODE -ne 0) {
			Die "the binary was installed to $exe but does not run on this machine."
		}

		Say "installed to $exe"
		Add-ToUserPath $dir
		Say 'open a new terminal and run: jukebox --help'
	} finally {
		# Removed however this exits, the failure paths included, so a refused
		# checksum leaves no unverified binary behind for somebody to find.
		Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
	}
}

Install-Jukebox
