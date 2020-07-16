import Builtin from "../structs/builtin";
import Modals from "../ui/modals";
import {DataStore, Strings} from "modules";

export default new class WindowPrefs extends Builtin {
    get name() {return "WindowPrefs";}
    get category() {return "window";}
    get id() {return "transparency";}

    initialize() {
        super.initialize();
        this.prefs = DataStore.getData("windowprefs") || {};
    }

    enabled() {
        this.setWindowPreference("transparent", true);
        this.setWindowPreference("backgroundColor", "#00000000");
        this.showModal(Strings.WindowPrefs.enabledInfo);
    }

    disabled() {
        this.deleteWindowPreference("transparent");
        this.deleteWindowPreference("backgroundColor");
        this.showModal(Strings.WindowPrefs.disabledInfo);
    }

    showModal(info) {
        Modals.showConfirmationModal(Strings.Modals.additionalInfo, info, {
            confirmText: Strings.Modals.restartNow,
            cancelText: Strings.Modals.restartLater,
            onConfirm: () => {
                const app = require("electron").remote.app;
                app.relaunch();
                app.exit();
            }
        });
    }

    getWindowPreference(key) {
        return this.prefs[key];
    }

    setWindowPreference(key, value) {
        this.prefs[key] = value;
        DataStore.setData("windowprefs", this.prefs);
    }

    deleteWindowPreference(key) {
        delete this.prefs[key];
        DataStore.setData("windowprefs", this.prefs);
    }
};