import LocaleManager from "./localemanager";

import Logger from "./logger";
import {Config, Changelog} from "data";
// import EmoteModule from "./emotes";
// import QuickEmoteMenu from "../builtins/emotemenu";
import DOMManager from "./dommanager";
import PluginManager from "./pluginmanager";
import ThemeManager from "./thememanager";
import Settings from "./settingsmanager";
import * as Builtins from "builtins";
import Modals from "../ui/modals";
import ReactComponents from "./reactcomponents";
import DataStore from "./datastore";
import DiscordModules from "./discordmodules";
import ComponentPatcher from "./componentpatcher";
import Strings from "./strings";


const GuildClasses = DiscordModules.GuildClasses;

function Core() {
}

Core.prototype.setConfig = function(config) {
    Object.assign(Config, config);
};

Core.prototype.init = async function() {

    DataStore.initialize();
    await LocaleManager.initialize();

    if (Config.version < Config.minSupportedVersion) {
        return Modals.alert(Strings.Startup.notSupported, Strings.Startup.versionMismatch.format({injector: Config.version, remote: Config.bbdVersion}));
    }

    if (window.ED) {
        return Modals.alert(Strings.Startup.notSupported, Strings.Startup.incompatibleApp.format({app: "EnhancedDiscord"}));
    }

    if (window.WebSocket && window.WebSocket.name && window.WebSocket.name.includes("Patched")) {
        return Modals.alert(Strings.Startup.notSupported, Strings.Startup.incompatibleApp.format({app: "Powercord"}));
    }

    console.log(Config);

    const latestLocalVersion = Config.updater ? Config.updater.LatestVersion : Config.latestVersion;
    if (latestLocalVersion > Config.version) {
        Modals.showConfirmationModal(Strings.Startup.updateAvailable, Strings.Startup.updateInfo.format({version: latestLocalVersion}), {
            confirmText: Strings.Startup.updateNow,
            cancelText: Strings.Startup.maybeLater,
            onConfirm: async () => {
                const onUpdateFailed = () => {Modals.alert(Strings.Startup.updateFailed, Strings.Startup.manualUpdate);};
                try {
                    const didUpdate = await this.updateInjector();
                    if (!didUpdate) return onUpdateFailed();
                    const app = require("electron").remote.app;
                    app.relaunch();
                    app.exit();
                }
                catch (err) {
                    onUpdateFailed();
                }
            }
        });
    }

    


    Logger.log("Startup", "Initializing Settings");
    Settings.initialize();

    DOMManager.initialize();
    await this.waitForGuilds();
    ReactComponents.initialize();
    ComponentPatcher.initialize();
    for (const module in Builtins) Builtins[module].initialize();

    Logger.log("Startup", "Loading Plugins");
    const pluginErrors = PluginManager.initialize();

    Logger.log("Startup", "Loading Themes");
    const themeErrors = ThemeManager.initialize();

    Logger.log("Startup", "Removing Loading Icon");
    document.getElementsByClassName("bd-loaderv2")[0].remove();

    // Show loading errors
    Logger.log("Startup", "Collecting Startup Errors");
    Modals.showAddonErrors({plugins: pluginErrors, themes: themeErrors});

    const previousVersion = DataStore.getBDData("version");
    if (Config.bbdVersion > previousVersion) {
        this.showChangelogModal(Changelog);
        DataStore.setBDData("version", Config.bbdVersion);
    }
};

Core.prototype.waitForGuilds = function() {
    let timesChecked = 0;
    return new Promise(resolve => {
        const checkForGuilds = function() {
            timesChecked++;
            if (document.readyState != "complete") setTimeout(checkForGuilds, 100);
            const wrapper = GuildClasses.wrapper.split(" ")[0];
            const guild = GuildClasses.listItem.split(" ")[0];
            const blob = GuildClasses.blobContainer.split(" ")[0];
            if (document.querySelectorAll(`.${wrapper} .${guild} .${blob}`).length > 0) return resolve(Config.deferLoaded = true);
            else if (timesChecked >= 50) return resolve(Config.deferLoaded = true);
            setTimeout(checkForGuilds, 100);
        };

        checkForGuilds();
    });
};

Core.prototype.updateInjector = async function() {
    const injectionPath = DataStore.injectionPath;
    if (!injectionPath) return false;

    const fs = require("fs");
    const path = require("path");
    const rmrf = require("rimraf");
    const yauzl = require("yauzl");
    const mkdirp = require("mkdirp");
    const request = require("request");

    const parentPath = path.resolve(injectionPath, "..");
    const folderName = path.basename(injectionPath);
    const zipLink = "https://github.com/rauenzi/BetterDiscordApp/archive/injector.zip";
    const savedZip = path.resolve(parentPath, "injector.zip");
    const extractedFolder = path.resolve(parentPath, "BetterDiscordApp-injector");

    // Download the injector zip file
    Logger.log("InjectorUpdate", "Downloading " + zipLink);
    let success = await new Promise(resolve => {
        request.get({url: zipLink, encoding: null}, async (error, response, body) => {
            if (error || response.statusCode !== 200) return resolve(false);
            // Save a backup in case someone has their own copy
            const alreadyExists = await new Promise(res => fs.exists(savedZip, res));
            if (alreadyExists) await new Promise(res => fs.rename(savedZip, `${savedZip}.bak${Math.round(performance.now())}`, res));

            Logger.log("InjectorUpdate", "Writing " + savedZip);
            fs.writeFile(savedZip, body, err => resolve(!err));
        });
    });
    if (!success) return success;

    // Check and delete rename extraction
    const alreadyExists = await new Promise(res => fs.exists(extractedFolder, res));
    if (alreadyExists) await new Promise(res => fs.rename(extractedFolder, `${extractedFolder}.bak${Math.round(performance.now())}`, res));
    
    // Unzip the downloaded zip file
    const zipfile = await new Promise(r => yauzl.open(savedZip, {lazyEntries: true}, (err, zip) =>  r(zip)));
    zipfile.on("entry", function(entry) {
        // Skip directories, they are handled with mkdirp
        if (entry.fileName.endsWith("/")) return zipfile.readEntry();

        Logger.log("InjectorUpdate", "Extracting " + entry.fileName);
        // Make any needed parent directories
        const fullPath = path.resolve(parentPath, entry.fileName);
        mkdirp.sync(path.dirname(fullPath));
        zipfile.openReadStream(entry, function(err, readStream) {
            if (err) return success = false;
            readStream.on("end", function() {zipfile.readEntry();}); // Go to next file after this
            readStream.pipe(fs.createWriteStream(fullPath));
        });
    });
    zipfile.readEntry(); // Start reading

    // Wait for the final file to finish
    await new Promise(resolve => zipfile.once("end", resolve));

    // Save a backup in case something goes wrong during final step
    const backupFolder = path.resolve(parentPath, `${folderName}.bak${Math.round(performance.now())}`);
    await new Promise(resolve => fs.rename(injectionPath, backupFolder, resolve));

    // Rename the extracted folder to what it should be
    Logger.log("InjectorUpdate", `Renaming ${path.basename(extractedFolder)} to ${folderName}`);
    success = await new Promise(resolve => fs.rename(extractedFolder, injectionPath, err => resolve(!err)));
    if (!success) {
        Logger.err("InjectorUpdate", "Failed to rename the final directory");
        return success;
    }

    // If rename had issues, delete what we tried to rename and restore backup
    if (!success) {
        Logger.err("InjectorUpdate", "Something went wrong... restoring backups.");
        await new Promise(resolve => rmrf(extractedFolder, resolve));
        await new Promise(resolve => fs.rename(backupFolder, injectionPath, resolve));
        return success;
    }

    // If we've gotten to this point, everything should have gone smoothly.
    // Cleanup the backup folder then remove the zip
    await new Promise(resolve => rmrf(backupFolder, resolve));
    await new Promise(resolve => fs.unlink(savedZip, resolve));

    Logger.log("InjectorUpdate", "Injector Updated!");
    return success;
};

export default new Core();