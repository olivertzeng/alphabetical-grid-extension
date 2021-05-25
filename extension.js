const {GLib} = imports.gi;
const Main = imports.ui.main;
const Config = imports.misc.config;
const ExtensionUtils = imports.misc.extensionUtils;
const Gettext = imports.gettext;
Gettext.textdomain("AlphabeticalAppGrid@stuarthayhurst");
Gettext.bindtextdomain("AlphabeticalAppGrid@stuarthayhurst", ExtensionSystem.extensionMeta["AlphabeticalAppGrid@stuarthayhurst"].path + "/locale");

const _ = Gettext.gettext;

function enable() {
  gridReorder = new Extension();
  //Reorder initially, to provide an intial reorder, as well as apps not already taken care of
  gridReorder.reorderGrid();
  //Wait until the grid is reordered or app folders changed for further reorders
  gridReorder.waitForExternalReorder();
  gridReorder.waitForFolderChange();
}

function disable() {
  //Disconnect from events and clean up
  gridReorder.shellSettings.disconnect(gridReorder.reorderSignal);
  gridReorder.folderSettings.disconnect(gridReorder.folderSignal);
  gridReorder = null;
}

class Extension {
  constructor() {
    //Load gsettings values for GNOME Shell, to access 'app-picker-layout'
    this.shellSettings = ExtensionUtils.getSettings('org.gnome.shell');
    //Load gsettings values for folders, to access 'folder-children'
    this.folderSettings = ExtensionUtils.getSettings('org.gnome.desktop.app-folders');
    //Get access to appDisplay
    this._appDisplay = Main.overview._overview._controls._appDisplay;
    //Get GNOME shell version
    this.shellVersion = Number.parseInt(Config.PACKAGE_VERSION.split('.'));
  }

  _logMessage(message) {
    log('alphabetical-app-grid: ' + message);
  }

  reorderGrid() {
    //Alphabetically order the grid, by blanking the gsettings value for 'app-picker-layout'
    if (this.shellSettings.is_writable('app-picker-layout')) {
      //Change gsettings value
      this.shellSettings.set_value('app-picker-layout', new GLib.Variant('aa{sv}', []));

      //Trigger a refresh of the app grid, if shell version is greater than 40
      if (this.shellVersion < 40) {
        this._logMessage(_('Running GNOME shell 3.38 or lower, skipping reload'));
      } else {
        //Use call() so 'this' applies to this._appDisplay
        this.reloadAppDisplay.call(this._appDisplay);
      }

      this._logMessage(_('Reordered grid'));
    } else {
      this._logMessage(_('org.gnome.shell app-picker-layout in unwritable, skipping reorder'));
    }
  }

  waitForFolderChange() {
    //If a folder was made or deleted, trigger a reorder
    this.folderSignal = this.folderSettings.connect('changed::folder-children', () => {
      this._logMessage(_('Folders changed, triggering reorder'));
      this.reorderGrid();
    });
  }

  waitForExternalReorder() {
    //Connect to gsettings and wait for the order to change
    this.reorderSignal = this.shellSettings.connect('changed::app-picker-layout', () => {
      //Work out if the change was internal or external
      let appLayout = this.shellSettings.get_value('app-picker-layout');
      if (appLayout.recursiveUnpack() != '') {
        //When an external change is picked up, reorder the grid
        this._logMessage(_('App grid layout changed, triggering reorder'));
        this.reorderGrid();
      }
    });
  }

  reloadAppDisplay() {
    //Reload app grid to apply any pending changes
    this._pageManager._loadPages();
    this._redisplay();

    const { itemsPerPage } = this._grid;
    //Array of apps, sorted alphabetically
    let apps = this._loadApps().sort(this._compareItems.bind(this));

    //Move each app to correct grid postion
    apps.forEach((icon, index) => {
      const page = Math.floor(index / itemsPerPage);
      const position = index % itemsPerPage;
      this._moveItem(icon, page, position);
    });

    //Emit 'view-loaded' signal
    this.emit('view-loaded');
  }
}
